# ws-dbus

Create workspaces, move and resize windows, and tile layouts from the command line. A small GNOME Shell extension that brings scriptable window management back to Wayland.

```bash
ws_call SwitchToNew                  # create workspace and switch to it
ws_call ListWindows -- -1            # list all windows (JSON)
ws_call MoveResize $ID 0 0 960 1080  # position and size a window
ws_call Focus $ID                    # activate a window
```

## Why this exists

On GNOME 46+ Wayland, the traditional tools for scripting workspaces and windows are gone:

- **wmctrl / xdotool** — X11 only, don't work on Wayland
- **Shell.Eval** — disabled since GNOME 41 (arbitrary JS in the compositor)
- **Shell.Introspect** — read-only, can't move or resize anything

ws-dbus fills this gap. It exposes workspace and window control as D-Bus methods — callable from shell scripts, CLI tools, and coding agents alike.

## Use cases

- **Workspace-per-project launchers** — open a terminal + editor + browser on a new workspace for each project
- **Window tiling from scripts** — query the work area, then position windows with `MoveResize`
- **Agent-driven layouts** — coding agents can query windows, find what's open, and arrange them
- **Session restore** — recreate a multi-workspace layout on login
- **Git worktree workflows** — isolated workspace per branch with its own services

## Install

Requires GNOME Shell 46+.

### From extensions.gnome.org (recommended)

Install from the [GNOME Extensions page](https://extensions.gnome.org/extension/9340/workspace-d-bus/).

### From GitHub release

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

```bash
# Edit extension.js
make install          # copy to GNOME extensions dir
                      # log out and back in (GNOME caches JS modules)
make enable           # if not already enabled
make test             # requires bats and jq
```

`make pack` builds the distributable zip. `make uninstall` removes the extension.

## Usage

The extension runs on the D-Bus session bus. Add this helper to your script or `.bashrc`:

```bash
WS_DEST="org.gnome.Shell"
WS_PATH="/org/gnome/Shell/Extensions/WsDbus"
WS_IFACE="org.gnome.Shell.Extensions.WsDbus"

ws_call() {
    gdbus call --session --dest "$WS_DEST" \
        --object-path "$WS_PATH" \
        --method "$WS_IFACE.$1" "${@:2}" 2>/dev/null
}
```

Parse return values with `grep -oP '\d+'`. Parse JSON with `jq`:

```bash
count=$(ws_call GetCount | grep -oP '\d+')
active=$(ws_call GetActive | grep -oP '\d+')

# Find a window by class and move it to workspace 2
windows=$(ws_call ListWindows -- -1 | sed "s/^('//;s/',)$//")
browser_id=$(echo "$windows" | jq -r '.[] | select(.wm_class == "Google-chrome") | .id')
ws_call MoveToWorkspace "$browser_id" 2
```

### Tiling example

Create a workspace with a terminal on the left and an editor on the right:

```bash
ws_call SwitchToNew
ws_idx=$(ws_call GetActive | grep -oP '\d+')

# Get usable screen area (excludes panels/docks)
area=$(ws_call GetWorkArea | sed "s/^('//;s/',)$//")
x=$(echo "$area" | jq '.x');  y=$(echo "$area" | jq '.y')
w=$(echo "$area" | jq '.width');  h=$(echo "$area" | jq '.height')

# Wait for windows to appear, then tile
windows=$(ws_call ListWindows "$ws_idx" | sed "s/^('//;s/',)$//")
term_id=$(echo "$windows" | jq -r '.[] | select(.wm_class | ascii_downcase == "gnome-terminal-server") | .id')
code_id=$(echo "$windows" | jq -r '.[] | select(.wm_class | ascii_downcase == "code") | .id')

ws_call MoveResize "$term_id" "$x" "$y" $((w / 2)) "$h"
ws_call MoveResize "$code_id" $((x + w / 2)) "$y" $((w / 2)) "$h"
ws_call Focus "$term_id"
```

If the extension is not installed or enabled, `gdbus` exits with code 2 and prints to stderr.

## API

Session bus, destination `org.gnome.Shell`, path `/org/gnome/Shell/Extensions/WsDbus`, interface `org.gnome.Shell.Extensions.WsDbus`.

### Workspace methods

| Method | Args | Returns | Description |
|--------|------|---------|-------------|
| `SwitchToNew` | — | `i` index | Append a new workspace and switch to it |
| `Switch` | `i` index | `b` success | Switch to workspace by index (0-based) |
| `GetCount` | — | `i` count | Number of workspaces |
| `GetActive` | — | `i` index | Active workspace index (0-based) |
| `ListWindows` | `i` workspaceIndex | `s` JSON | Windows on a workspace, or all if `-1` |
| `MoveToWorkspace` | `u` windowId, `i` workspaceIndex | `b` success | Move a window to a workspace |

### Window methods

| Method | Args | Returns | Description |
|--------|------|---------|-------------|
| `MoveResize` | `u` windowId, `i` x, `i` y, `i` width, `i` height | `b` success | Move and resize (unmaximizes first) |
| `Maximize` | `u` windowId | `b` success | Maximize a window |
| `Unmaximize` | `u` windowId | `b` success | Unmaximize a window |
| `Minimize` | `u` windowId | `b` success | Minimize a window |
| `Unminimize` | `u` windowId | `b` success | Unminimize a window |
| `Fullscreen` | `u` windowId | `b` success | Make a window fullscreen |
| `Unfullscreen` | `u` windowId | `b` success | Exit fullscreen |
| `Focus` | `u` windowId | `b` success | Activate and focus a window |
| `GetWorkArea` | — | `s` JSON | Usable screen area (excludes panels/docks) |

Get window IDs from `ListWindows`:

```json
[
  {"id": 2497529088, "workspace": 0, "wm_class": "gnome-terminal-server", "title": "Claude Code", "pid": 433605},
  {"id": 1234567890, "workspace": 1, "wm_class": "Google-chrome", "title": "GitHub", "pid": 112233}
]
```

### Signals

Subscribe with `gdbus monitor --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/WsDbus`.

| Signal | Args | Description |
|--------|------|-------------|
| `WorkspaceSwitched` | `i` oldIndex, `i` newIndex | Active workspace changed |
| `WorkspaceAdded` | `i` count | Workspace created (count is new total) |
| `WorkspaceRemoved` | `i` count | Workspace removed (count is new total) |

## Security

This extension runs inside the GNOME Shell process — the same trust model as every GNOME extension. It does not re-enable `Shell.Eval` or execute arbitrary code.

**What it can do:** Switch workspaces, list windows, move/resize/focus windows, and query the work area.

**What it cannot do:** Read window content, capture screenshots, monitor input, or access the filesystem. `ListWindows` exposes window titles (which may contain document names or URLs) — the same data visible in Alt+Tab.

**Who can call it:** Any process running as your user via the D-Bus session bus. Flatpak and Snap apps are filtered by default.

[Why Shell.Eval was disabled](https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/3943) — this extension re-exposes only workspace and window management, not arbitrary code execution.

## License

MIT
