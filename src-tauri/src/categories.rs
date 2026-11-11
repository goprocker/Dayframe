//! Default category for a newly seen application, from its executable name.
//! Users can override this in Settings.

pub const CATEGORIES: &[&str] = &[
    "Development",
    "Browsing",
    "Communication",
    "Design",
    "Productivity",
    "Entertainment",
    "System",
    "Other",
];

const RULES: &[(&str, &[&str])] = &[
    (
        "Development",
        &[
            "code",
            "devenv",
            "idea64",
            "pycharm64",
            "rider64",
            "webstorm64",
            "clion64",
            "goland64",
            "sublime_text",
            "notepad++",
            "windowsterminal",
            "wt",
            "cmd",
            "powershell",
            "pwsh",
            "githubdesktop",
            "cursor",
            "zed",
            "nvim-qt",
            "postman",
            "docker desktop",
        ],
    ),
    (
        "Browsing",
        &[
            "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "arc",
        ],
    ),
    (
        "Communication",
        &[
            "slack",
            "teams",
            "ms-teams",
            "discord",
            "zoom",
            "outlook",
            "olk",
            "thunderbird",
            "telegram",
            "whatsapp",
            "signal",
        ],
    ),
    (
        "Design",
        &[
            "figma",
            "photoshop",
            "illustrator",
            "afterfx",
            "blender",
            "inkscape",
            "gimp-2.10",
            "affinity",
            "xd",
        ],
    ),
    (
        "Productivity",
        &[
            "winword", "excel", "powerpnt", "onenote", "notion", "obsidian", "acrobat", "acrord32",
            "notepad",
        ],
    ),
    (
        "Entertainment",
        &["spotify", "vlc", "steam", "netflix", "epicgameslauncher"],
    ),
    (
        "System",
        &["explorer", "taskmgr", "systemsettings", "mmc", "control"],
    ),
];

/// `exe_key` is a lower-cased executable path.
pub fn guess_category(exe_key: &str) -> &'static str {
    let file = exe_key.rsplit(['\\', '/']).next().unwrap_or(exe_key);
    let stem = file.strip_suffix(".exe").unwrap_or(file);
    RULES
        .iter()
        .find(|(_, names)| names.contains(&stem))
        .map(|(c, _)| *c)
        .unwrap_or("Other")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guesses() {
        assert_eq!(
            guess_category(r"c:\program files\microsoft vs code\code.exe"),
            "Development"
        );
        assert_eq!(guess_category(r"c:\x\chrome.exe"), "Browsing");
        assert_eq!(guess_category(r"c:\x\unknownthing.exe"), "Other");
        assert!(RULES.iter().all(|(c, _)| CATEGORIES.contains(c)));
    }
}
