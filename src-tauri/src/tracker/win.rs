//! Windows sampler: reads the foreground process, input idle time and lock
//! state. Only the executable path and its file description are read — never
//! window titles, URLs, keystrokes or screen contents.

use std::collections::HashMap;
use std::ffi::c_void;

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};
use windows::Win32::System::StationsAndDesktops::{
    CloseDesktop, GetUserObjectInformationW, OpenInputDesktop, DESKTOP_ACCESS_FLAGS,
    DESKTOP_CONTROL_FLAGS, UOI_NAME,
};
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

use super::engine::ForegroundApp;

/// Key used for processes we are not allowed to inspect (elevated / system).
pub const PROTECTED_KEY: &str = "::protected";

/// Caches display names per executable so version resources are read once.
#[derive(Default)]
pub struct Sampler {
    names: HashMap<String, String>,
}

impl Sampler {
    pub fn foreground_app(&mut self) -> Option<ForegroundApp> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            let Some(path) = process_path(pid) else {
                return Some(ForegroundApp {
                    key: PROTECTED_KEY.into(),
                    exe_path: String::new(),
                    display_name: "Protected application".into(),
                });
            };
            let key = path.to_lowercase();
            let name = self
                .names
                .entry(key.clone())
                .or_insert_with(|| display_name(&path))
                .clone();
            Some(ForegroundApp {
                key,
                exe_path: path,
                display_name: name,
            })
        }
    }
}

unsafe fn process_path(pid: u32) -> Option<String> {
    let h: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    let mut buf = [0u16; 1024];
    let mut len = buf.len() as u32;
    let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
    let _ = CloseHandle(h);
    r.ok()?;
    Some(String::from_utf16_lossy(&buf[..len as usize]))
}

fn exe_stem(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

/// `FileDescription` from the version resource, falling back to the exe name.
fn display_name(path: &str) -> String {
    file_description(path)
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| exe_stem(path))
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn file_description(path: &str) -> Option<String> {
    unsafe {
        let wpath = wide(path);
        let size = GetFileVersionInfoSizeW(PCWSTR(wpath.as_ptr()), None);
        if size == 0 {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        GetFileVersionInfoW(
            PCWSTR(wpath.as_ptr()),
            None,
            size,
            data.as_mut_ptr() as *mut c_void,
        )
        .ok()?;

        // Language/codepage pairs.
        let mut ptr: *mut c_void = std::ptr::null_mut();
        let mut len = 0u32;
        let q = wide("\\VarFileInfo\\Translation");
        let mut langs: Vec<(u16, u16)> = Vec::new();
        if VerQueryValueW(
            data.as_ptr() as *const c_void,
            PCWSTR(q.as_ptr()),
            &mut ptr,
            &mut len,
        )
        .as_bool()
            && !ptr.is_null()
        {
            let n = len as usize / 4;
            let pairs = std::slice::from_raw_parts(ptr as *const u16, n * 2);
            for p in pairs.chunks(2) {
                langs.push((p[0], p[1]));
            }
        }
        // Common fallbacks: US English with Unicode / Western codepages.
        langs.extend([(0x0409, 0x04B0), (0x0409, 0x04E4), (0x0000, 0x04B0)]);

        for (lang, cp) in langs {
            let q = wide(&format!(
                "\\StringFileInfo\\{lang:04x}{cp:04x}\\FileDescription"
            ));
            let mut ptr: *mut c_void = std::ptr::null_mut();
            let mut len = 0u32;
            if VerQueryValueW(
                data.as_ptr() as *const c_void,
                PCWSTR(q.as_ptr()),
                &mut ptr,
                &mut len,
            )
            .as_bool()
                && !ptr.is_null()
                && len > 1
            {
                let s = std::slice::from_raw_parts(ptr as *const u16, len as usize);
                let end = s.iter().position(|&c| c == 0).unwrap_or(s.len());
                return Some(String::from_utf16_lossy(&s[..end]));
            }
        }
        None
    }
}

/// True when the foreground window covers its whole monitor (games, video,
/// presentations). The desktop and shell windows never count.
pub fn foreground_is_fullscreen() -> bool {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONULL,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetDesktopWindow, GetShellWindow, GetWindowRect,
    };
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() || hwnd == GetDesktopWindow() || hwnd == GetShellWindow() {
            return false;
        }
        let mut class = [0u16; 32];
        let n = GetClassNameW(hwnd, &mut class).max(0) as usize;
        let class = String::from_utf16_lossy(&class[..n]);
        if class == "WorkerW" || class == "Progman" {
            return false;
        }
        let mut r = RECT::default();
        if GetWindowRect(hwnd, &mut r).is_err() {
            return false;
        }
        let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONULL);
        if mon.is_invalid() {
            return false;
        }
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(mon, &mut mi).as_bool() {
            return false;
        }
        let m = mi.rcMonitor;
        r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
    }
}

/// Milliseconds since the last keyboard or mouse input in this session.
pub fn idle_ms() -> i64 {
    unsafe {
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if !GetLastInputInfo(&mut info).as_bool() {
            return 0;
        }
        // Both are 32-bit tick counts; wrapping_sub handles the 49.7-day wrap.
        GetTickCount().wrapping_sub(info.dwTime) as i64
    }
}

/// True when the secure desktop (lock screen / UAC) owns input.
pub fn is_locked() -> bool {
    const DESKTOP_READOBJECTS: u32 = 0x0001;
    unsafe {
        let Ok(desk) = OpenInputDesktop(
            DESKTOP_CONTROL_FLAGS(0),
            false,
            DESKTOP_ACCESS_FLAGS(DESKTOP_READOBJECTS),
        ) else {
            return true;
        };
        let mut buf = [0u16; 64];
        let mut needed = 0u32;
        let ok = GetUserObjectInformationW(
            HANDLE(desk.0),
            UOI_NAME,
            Some(buf.as_mut_ptr() as *mut c_void),
            (buf.len() * 2) as u32,
            Some(&mut needed),
        )
        .is_ok();
        let _ = CloseDesktop(desk);
        if !ok {
            return false;
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        !String::from_utf16_lossy(&buf[..end]).eq_ignore_ascii_case("Default")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stem_fallback() {
        assert_eq!(exe_stem("C:\\Apps\\Code.exe"), "Code");
    }

    #[test]
    fn reads_description_of_system_binary() {
        let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
        let name = display_name(&format!("{windir}\\System32\\notepad.exe"));
        assert!(!name.is_empty());
    }

    #[test]
    fn idle_is_non_negative() {
        assert!(idle_ms() >= 0);
    }
}
