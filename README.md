# ws-dbus

Control GNOME workspaces and windows from the command line. Works on Wayland.

```bash
ws_call SwitchToNew          # create a new workspace and switch to it
ws_call Switch 2             # switch to workspace 3 (0-based)
ws_call GetCount             # how many workspaces exist
ws_call GetActive            # which one is active
ws_call ListWindows 0        # list windows on workspace 1 (JSON)
ws_call ListWindows -- -1    # list windows on all workspaces
ws_call MoveToWorkspace $ID 1  # move a window to workspace 2
```

On GNOME 46+ with Wayland, `wmctrl` and `xdotool` don't work (X11 only), `Shell.Eval` is disabled, and `Shell.Introspect` is read-only. ws-dbus is a small GNOME Shell extension that fills this gap — it exposes workspace and window control over D-Bus so CLI tools and scripts can use it.

## Use cases

- **Workspace-per-project launchers** — create a new workspace, then open a terminal + editor + browser for a specific project
- **Session managers** — restore a multi-workspace layout on login
- **Git worktree workflows** — spin up an isolated workspace for each branch with its own services running
- **Window organization** — move windows between workspaces from scripts (e.g., "put all terminals on workspace 1")
- **Workspace-aware tooling** — query window titles per workspace to auto-name workspaces, track time, or find a specific app

## Install

Requires GNOME Shell 46+.

### From release (recommended)

Download the latest zip from [Releases](https://github.com/kemallette/ws-dbus/releases):

```bash
gnome-extensions install ws-dbus@kemallette.shell-extension.zip
```

Log out and back in, then enable:

```bash
gnome-extensions enable ws-dbus@kemallette
```

### From source

```bash
git clone https://github.com/kemallette/ws-dbus.git
cd ws-dbus
make install
```

Log out and back in, then `make enable`.

### Development

The edit/test loop for contributors:

```bash
# Edit extension.js
make install          # copy to GNOME extensions dir
                      # log out and back in (GNOME caches JS modules)
make enable           # if not already enabled
make test             # requires bats and jq
```

`make pack` builds the distributable zip. `make uninstall` removes the extension.

## Usage

The extension communicates over the D-Bus session bus. The `ws_call` wrapper keeps commands readable:

```bash
WS_DEST="org.gnome.Shell"
WS_PATH="/com/kemallette/Workspace"
WS_IFACE="com.kemallette.Workspace"

ws_call() {
    gdbus call --session --dest "$WS_DEST" \
        --object-path "$WS_PATH" \
        --method "$WS_IFACE.$1" "${@:2}" 2>/dev/null
}
```

Parse return values with `grep -oP '\d+'`. Parse JSON with `jq`:

```bash
index=$(ws_call SwitchToNew | grep -oP '\d+')
count=$(ws_call GetCount | grep -oP '\d+')
active=$(ws_call GetActive | grep -oP '\d+')

# List all windows, find one by class, move it
windows=$(ws_call ListWindows -- -1 | sed "s/^('//;s/',)$//")
browser_id=$(echo "$windows" | jq -r '.[] | select(.wm_class == "Google-chrome") | .id')
ws_call MoveToWorkspace "$browser_id" 2
```

If the extension is not installed or enabled, `gdbus` exits with code 2 and prints to stderr. The extension must be installed, enabled, and the user must have logged in after installation for GNOME Shell to discover it.

## API

Session bus, destination `org.gnome.Shell`, path `/com/kemallette/Workspace`, interface `com.kemallette.Workspace`.

### Methods

| Method | Args | Returns | Description |
|--------|------|---------|-------------|
| `SwitchToNew` | — | `i` index | Append a new workspace and switch to it |
| `Switch` | `i` index | `b` success | Switch to workspace by index (0-based) |
| `GetCount` | — | `i` count | Get the number of workspaces |
| `GetActive` | — | `i` index | Get the active workspace index (0-based) |
| `ListWindows` | `i` workspaceIndex | `s` JSON | List windows on a workspace. Pass `-1` for all workspaces. |
| `MoveToWorkspace` | `u` windowId, `i` workspaceIndex | `b` success | Move a window to a workspace. Get window IDs from `ListWindows`. |

`ListWindows` returns a JSON array:

```json
[
  {"id": 2497529088, "workspace": 0, "wm_class": "gnome-terminal-server", "title": "Claude Code", "pid": 433605},
  {"id": 1234567890, "workspace": 1, "wm_class": "Google-chrome", "title": "GitHub", "pid": 112233}
]
```

### Signals

Subscribe with `gdbus monitor --session --dest org.gnome.Shell --object-path /com/kemallette/Workspace`.

| Signal | Args | Description |
|--------|------|-------------|
| `WorkspaceSwitched` | `i` oldIndex, `i` newIndex | Emitted when the active workspace changes |
| `WorkspaceAdded` | `i` count | Emitted when a workspace is created (count is the new total) |
| `WorkspaceRemoved` | `i` count | Emitted when a workspace is removed (count is the new total) |

## Security

This extension runs inside the GNOME Shell process — the same trust model as every GNOME extension. It calls `global.workspace_manager` internally and exports the results over D-Bus. It does not re-enable `Shell.Eval` or execute arbitrary code.

**Scope:** These methods can switch workspaces, list window titles/classes per workspace, and move windows between workspaces. They cannot read window content, capture screenshots, monitor input, or access the filesystem. `ListWindows` exposes window titles, which may contain document names or URLs — the same data visible in the Alt+Tab switcher.

**Callers:** Any process running as your user can call these methods (that's the D-Bus session bus model). Flatpak and Snap apps are filtered by default.

GNOME locked down `Shell.Eval` because it allowed arbitrary JS execution in the compositor. That was the right call. This re-exposes only workspace navigation and window-to-workspace queries. [Full background.](https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/3943)

## License

MIT
