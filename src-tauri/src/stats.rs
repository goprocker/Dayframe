//! Aggregations over clipped intervals. Day boundaries are supplied by the
//! caller (the UI computes local midnights), so DST and time zones are
//! handled where the local calendar is known and this module stays pure.

use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

use crate::db::{self, AppRow, Interval, Result};

const HOUR_MS: i64 = 3_600_000;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppUsage {
    pub app_id: i64,
    pub name: String,
    pub category: String,
    pub seconds: i64,
    pub sessions: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Longest {
    pub app_id: i64,
    pub name: String,
    pub seconds: i64,
    pub start: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub app_id: i64,
    pub start: i64,
    pub end: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DaySummary {
    pub from: i64,
    pub to: i64,
    pub total_seconds: i64,
    pub switches: i64,
    pub longest: Option<Longest>,
    /// Sorted by time spent, descending.
    pub apps: Vec<AppUsage>,
    /// Seconds of activity per hour bucket starting at `from`.
    pub hourly: Vec<i64>,
    /// Adjacent intervals of the same app merged (gap ≤ 2 s).
    pub timeline: Vec<Block>,
}

/// Pure aggregation, separated from the DB for testing.
pub fn summarize(from: i64, to: i64, iv: &[Interval], apps: &HashMap<i64, AppRow>) -> DaySummary {
    let mut usage: HashMap<i64, AppUsage> = HashMap::new();
    let mut timeline: Vec<Block> = Vec::new();
    let buckets = ((to - from + HOUR_MS - 1) / HOUR_MS).max(0) as usize;
    let mut hourly = vec![0i64; buckets];
    let mut total_ms = 0i64;

    for i in iv {
        let ms = (i.end - i.start).max(0);
        total_ms += ms;
        let name = apps.get(&i.app_id);
        let u = usage.entry(i.app_id).or_insert_with(|| AppUsage {
            app_id: i.app_id,
            name: name.map(|a| a.name.clone()).unwrap_or_else(|| "Unknown".into()),
            category: name.map(|a| a.category.clone()).unwrap_or_else(|| "Other".into()),
            seconds: 0,
            sessions: 0,
        });
        u.seconds += ms; // ms for now; converted below
        u.sessions += 1;

        // Spread across hour buckets.
        let mut t = i.start;
        while t < i.end {
            let b = ((t - from) / HOUR_MS) as usize;
            let bucket_end = from + (b as i64 + 1) * HOUR_MS;
            let seg_end = i.end.min(bucket_end);
            if let Some(h) = hourly.get_mut(b) {
                *h += seg_end - t;
            }
            t = seg_end;
        }

        match timeline.last_mut() {
            Some(last) if last.app_id == i.app_id && i.start - last.end <= 2_000 => {
                last.end = last.end.max(i.end);
            }
            _ => timeline.push(Block {
                app_id: i.app_id,
                start: i.start,
                end: i.end,
            }),
        }
    }

    let switches = timeline.len().saturating_sub(1) as i64;
    let longest = timeline
        .iter()
        .max_by_key(|b| b.end - b.start)
        .map(|b| Longest {
            app_id: b.app_id,
            name: apps
                .get(&b.app_id)
                .map(|a| a.name.clone())
                .unwrap_or_else(|| "Unknown".into()),
            seconds: (b.end - b.start) / 1000,
            start: b.start,
        });

    let mut apps_out: Vec<AppUsage> = usage
        .into_values()
        .map(|mut u| {
            u.seconds /= 1000;
            u
        })
        .collect();
    apps_out.sort_by(|a, b| b.seconds.cmp(&a.seconds).then(a.name.cmp(&b.name)));

    DaySummary {
        from,
        to,
        total_seconds: total_ms / 1000,
        switches,
        longest,
        apps: apps_out,
        hourly: hourly.into_iter().map(|ms| ms / 1000).collect(),
        timeline,
    }
}

fn app_map(conn: &rusqlite::Connection) -> Result<HashMap<i64, AppRow>> {
    Ok(db::list_apps(conn)?.into_iter().map(|a| (a.id, a)).collect())
}

pub fn day_summary(conn: &rusqlite::Connection, from: i64, to: i64) -> Result<DaySummary> {
    let iv = db::intervals(conn, from, to)?;
    Ok(summarize(from, to, &iv, &app_map(conn)?))
}

/// Total tracked seconds for each consecutive `[bounds[i], bounds[i+1])`.
pub fn range_totals(conn: &rusqlite::Connection, bounds: &[i64]) -> Result<Vec<i64>> {
    bounds
        .windows(2)
        .map(|w| {
            Ok(db::intervals(conn, w[0], w[1])?
                .iter()
                .map(|i| i.end - i.start)
                .sum::<i64>()
                / 1000)
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CategoryUsage {
    pub name: String,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DayTotals {
    pub from: i64,
    pub total_seconds: i64,
    /// Seconds per category for this day.
    pub categories: BTreeMap<String, i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RangeSummary {
    pub total_seconds: i64,
    /// Days with any tracked time.
    pub active_days: i64,
    pub days: Vec<DayTotals>,
    /// Sorted by time spent, descending.
    pub categories: Vec<CategoryUsage>,
    /// Sorted by time spent, descending.
    pub apps: Vec<AppUsage>,
    /// Seconds per local hour of day (0–23), summed over the range.
    pub hour_of_day: Vec<i64>,
}

/// Combine per-day summaries. `local_hour` maps a bucket start (UTC ms) to
/// its local hour so DST days land in the right hour of day.
pub fn summarize_range(days: &[DaySummary], local_hour: impl Fn(i64) -> usize) -> RangeSummary {
    let mut apps: HashMap<i64, AppUsage> = HashMap::new();
    let mut cats: HashMap<String, i64> = HashMap::new();
    let mut hour_of_day = vec![0i64; 24];
    let mut out_days = Vec::with_capacity(days.len());

    for d in days {
        let mut day_cats = BTreeMap::new();
        for a in &d.apps {
            *day_cats.entry(a.category.clone()).or_insert(0) += a.seconds;
            *cats.entry(a.category.clone()).or_insert(0) += a.seconds;
            let u = apps.entry(a.app_id).or_insert_with(|| AppUsage {
                seconds: 0,
                sessions: 0,
                ..a.clone()
            });
            u.seconds += a.seconds;
            u.sessions += a.sessions;
        }
        for (i, s) in d.hourly.iter().enumerate() {
            let h = local_hour(d.from + i as i64 * HOUR_MS).min(23);
            hour_of_day[h] += s;
        }
        out_days.push(DayTotals {
            from: d.from,
            total_seconds: d.total_seconds,
            categories: day_cats,
        });
    }

    let mut categories: Vec<CategoryUsage> = cats
        .into_iter()
        .map(|(name, seconds)| CategoryUsage { name, seconds })
        .collect();
    categories.sort_by(|a, b| b.seconds.cmp(&a.seconds).then(a.name.cmp(&b.name)));
    let mut apps: Vec<AppUsage> = apps.into_values().collect();
    apps.sort_by(|a, b| b.seconds.cmp(&a.seconds).then(a.name.cmp(&b.name)));

    RangeSummary {
        total_seconds: days.iter().map(|d| d.total_seconds).sum(),
        active_days: days.iter().filter(|d| d.total_seconds > 0).count() as i64,
        days: out_days,
        categories,
        apps,
        hour_of_day,
    }
}

/// Summary over consecutive `[bounds[i], bounds[i+1])` local days.
pub fn range_summary(conn: &rusqlite::Connection, bounds: &[i64]) -> Result<RangeSummary> {
    use chrono::{Local, TimeZone, Timelike};
    let map = app_map(conn)?;
    let days = bounds
        .windows(2)
        .map(|w| Ok(summarize(w[0], w[1], &db::intervals(conn, w[0], w[1])?, &map)))
        .collect::<Result<Vec<_>>>()?;
    Ok(summarize_range(&days, |ms| {
        Local
            .timestamp_millis_opt(ms)
            .single()
            .map(|t| t.hour() as usize)
            .unwrap_or(0)
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tracker::engine::ForegroundApp;

    const M: i64 = 60_000;

    fn apps() -> HashMap<i64, AppRow> {
        [(1, "Code"), (2, "Chrome")]
            .into_iter()
            .map(|(id, n)| {
                (
                    id,
                    AppRow {
                        id,
                        name: n.into(),
                        path: String::new(),
                        category: "Other".into(),
                        excluded: false,
                        first_seen_at: 0,
                    },
                )
            })
            .collect()
    }

    fn iv(app_id: i64, s: i64, e: i64) -> Interval {
        Interval { app_id, start: s, end: e }
    }

    #[test]
    fn totals_switches_and_longest() {
        let v = vec![
            iv(1, 0, 30 * M),
            iv(2, 30 * M, 40 * M),
            iv(1, 40 * M, 50 * M),
            iv(1, 50 * M + 1000, 90 * M), // merged with previous (1 s gap)
        ];
        let d = summarize(0, 24 * 60 * M, &v, &apps());
        assert_eq!(d.total_seconds, (90 * M - 1000) / 1000);
        assert_eq!(d.switches, 2);
        assert_eq!(d.timeline.len(), 3);
        let l = d.longest.unwrap();
        assert_eq!((l.app_id, l.seconds), (1, 50 * 60));
        assert_eq!(d.apps[0].name, "Code");
        assert_eq!(d.apps[0].sessions, 3);
        assert_eq!(d.apps[1].seconds, 600);
    }

    #[test]
    fn hourly_buckets_split_sessions() {
        let v = vec![iv(1, 50 * M, 70 * M)];
        let d = summarize(0, 24 * 60 * M, &v, &apps());
        assert_eq!(d.hourly.len(), 24);
        assert_eq!(d.hourly[0], 600);
        assert_eq!(d.hourly[1], 600);
    }

    #[test]
    fn dst_length_days_get_matching_buckets() {
        assert_eq!(summarize(0, 23 * 60 * M, &[], &apps()).hourly.len(), 23);
        assert_eq!(summarize(0, 25 * 60 * M, &[], &apps()).hourly.len(), 25);
    }

    #[test]
    fn midnight_spanning_session_is_split_between_days() {
        let conn = db::open_in_memory().unwrap();
        let a = ForegroundApp {
            key: "c:\\code.exe".into(),
            exe_path: "C:\\code.exe".into(),
            display_name: "Code".into(),
        };
        let id = db::upsert_app(&conn, &a, 0).unwrap();
        let day = 24 * 60 * M;
        let sid = db::open_session(&conn, id, day - 30 * M).unwrap();
        db::set_session_end(&conn, sid, day + 45 * M).unwrap();

        let d1 = day_summary(&conn, 0, day).unwrap();
        let d2 = day_summary(&conn, day, 2 * day).unwrap();
        assert_eq!(d1.total_seconds, 30 * 60);
        assert_eq!(d2.total_seconds, 45 * 60);
        assert_eq!(d1.hourly[23], 30 * 60);
        assert_eq!(d2.hourly[0], 45 * 60);
        assert_eq!(
            range_totals(&conn, &[0, day, 2 * day]).unwrap(),
            vec![30 * 60, 45 * 60]
        );
    }

    #[test]
    fn empty_day() {
        let d = summarize(0, 24 * 60 * M, &[], &apps());
        assert_eq!(d.total_seconds, 0);
        assert_eq!(d.switches, 0);
        assert!(d.longest.is_none());
        assert!(d.apps.is_empty());
    }

    #[test]
    fn range_merges_days_categories_and_hours() {
        let mut a = apps();
        a.get_mut(&2).unwrap().category = "Browsing".into();
        let day = 24 * 60 * M;
        let d1 = summarize(0, day, &[iv(1, 0, 60 * M), iv(2, 60 * M, 90 * M)], &a);
        let d2 = summarize(day, 2 * day, &[iv(1, day, day + 30 * M)], &a);
        let d3 = summarize(2 * day, 3 * day, &[], &a);
        let r = summarize_range(&[d1, d2, d3], |ms| ((ms / (60 * M)) % 24) as usize);
        assert_eq!(r.total_seconds, 120 * 60);
        assert_eq!(r.active_days, 2);
        assert_eq!(r.days.len(), 3);
        assert_eq!(r.days[0].categories["Browsing"], 30 * 60);
        assert_eq!(r.days[1].categories["Other"], 30 * 60);
        assert!(r.days[2].categories.is_empty());
        assert_eq!(
            r.categories,
            vec![
                CategoryUsage { name: "Other".into(), seconds: 90 * 60 },
                CategoryUsage { name: "Browsing".into(), seconds: 30 * 60 },
            ]
        );
        assert_eq!((r.apps[0].app_id, r.apps[0].seconds, r.apps[0].sessions), (1, 90 * 60, 2));
        assert_eq!(r.hour_of_day[0], 90 * 60);
        assert_eq!(r.hour_of_day[1], 30 * 60);
        assert_eq!(r.hour_of_day.iter().sum::<i64>(), r.total_seconds);
    }

    #[test]
    fn range_uses_local_hour_mapping() {
        // A 25 h day: bucket 24 maps back to hour 23 via the mapper.
        let d = summarize(0, 25 * 60 * M, &[iv(1, 24 * 60 * M, 25 * 60 * M)], &apps());
        let r = summarize_range(&[d], |ms| ((ms / (60 * M)) as usize).saturating_sub(1).min(23));
        assert_eq!(r.hour_of_day[23], 3600);
    }
}
