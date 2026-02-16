# ws-dbus

Create, switch, and query GNOME workspaces from the command line. Works on Wayland.

```bash
ws_call SwitchToNew   # create a new workspace and switch to it
ws_call Switch 2      # switch to workspace 3 (0-based)
ws_call GetCount      # how many workspaces exist
ws_call GetActive     # which one is active
```

On GNOME 46 with Wayland, `wmctrl` and `xdotool` don't work (X11 only), `Shell.Eval` is disabled, and `Shell.Introspect` is read-only. ws-dbus is a small GNOME Shell extension that fills this gap.

## Use cases

- **Workspace-per-project launchers** — create a new workspace, then open a terminal + editor + browser for a specific project
- **Session managers** — restore a multi-workspace layout on login
- **Git worktree workflows** — spin up an isolated workspace for each branch with its own services running

## Install

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/ws-dbus@kemallette
cp extension.js metadata.json ~/.local/share/gnome-shell/extensions/ws-dbus@kemallette/
```

Log out and back in, then enable:

```bash
gnome-extensions enable ws-dbus@kemallette
```

Requires GNOME Shell 46.

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

Parse return values with `grep -oP '\d+'`:

```bash
index=$(ws_call SwitchToNew | grep -oP '\d+')
count=$(ws_call GetCount | grep -oP '\d+')
active=$(ws_call GetActive | grep -oP '\d+')
```

If the extension is not installed or enabled, `gdbus` exits with code 2 and prints to stderr. The extension must be installed, enabled, and the user must have logged in after installation for GNOME Shell to discover it.

## API

Session bus, destination `org.gnome.Shell`, path `/com/kemallette/Workspace`, interface `com.kemallette.Workspace`.

| Method | Args | Returns | Description |
|--------|------|---------|-------------|
| `SwitchToNew` | — | `i` index | Append a new workspace and switch to it |
| `Switch` | `i` index | `b` success | Switch to workspace by index (0-based) |
| `GetCount` | — | `i` count | Get the number of workspaces |
| `GetActive` | — | `i` index | Get the active workspace index (0-based) |

## Security

This extension runs inside the GNOME Shell process — the same trust model as every GNOME extension. It calls `global.workspace_manager` internally and exports the results over D-Bus. It does not re-enable `Shell.Eval` or execute arbitrary code.

These four methods can switch workspaces and read workspace count. They cannot read window content, capture screenshots, monitor input, or access the filesystem. Any process running as your user can call them (that's the D-Bus session bus model). Flatpak and Snap apps are filtered by default.

GNOME locked down `Shell.Eval` because it allowed arbitrary JS execution in the compositor. That was the right call. This re-exposes only workspace navigation. [Full background.](https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/3943)

## License

MIT
