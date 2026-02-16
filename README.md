# ws-dbus

GNOME Shell extension that exposes workspace switching over D-Bus for CLI tools.

On GNOME 46+ with Wayland, there is no way to programmatically switch workspaces from outside the compositor. `wmctrl` and `xdotool` are X11-only. `Shell.Eval` is disabled. `Shell.Introspect` is read-only and restricted. This extension fills that gap by exposing four workspace methods over the session D-Bus.

## Requirements

- GNOME Shell 46

## Install

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/ws-dbus@kemallette
cp extension.js metadata.json ~/.local/share/gnome-shell/extensions/ws-dbus@kemallette/
```

Log out and back in (or restart the Shell on X11 with `Alt+F2` → `r`), then enable:

```bash
gnome-extensions enable ws-dbus@kemallette
```

## D-Bus API

Bus: `session`
Destination: `org.gnome.Shell`
Object path: `/com/kemallette/Workspace`
Interface: `com.kemallette.Workspace`

### Methods

| Method | Args | Returns | Description |
|--------|------|---------|-------------|
| `SwitchToNew` | — | `i` index | Append a new workspace and switch to it |
| `Switch` | `i` index | `b` success | Switch to workspace by index (0-based) |
| `GetCount` | — | `i` count | Get the number of workspaces |
| `GetActive` | — | `i` index | Get the active workspace index (0-based) |

### Examples

```bash
# Switch to a new workspace
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /com/kemallette/Workspace \
  --method com.kemallette.Workspace.SwitchToNew

# Switch to workspace 3
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /com/kemallette/Workspace \
  --method com.kemallette.Workspace.Switch 2

# Get workspace count
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /com/kemallette/Workspace \
  --method com.kemallette.Workspace.GetCount

# Get active workspace index
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /com/kemallette/Workspace \
  --method com.kemallette.Workspace.GetActive
```

## Security model

This extension runs inside the GNOME Shell compositor process and exports its own D-Bus interface. It is worth understanding what that means.

**Why GNOME locked down Shell.Eval:** The D-Bus session bus authenticates users by Unix UID, not by application. Any process running as your user can call any method on the session bus. GNOME Shell's built-in `Shell.Eval` method allowed arbitrary JavaScript execution inside the compositor — any local process could capture keystrokes, read clipboard, take screenshots, or inject input. GNOME 41 moved it behind `--unsafe-mode` (off by default), and GNOME 42 added allowlists to other sensitive methods. This was the right call.

**How this extension works:** GNOME extensions are loaded directly into the Shell process. Once enabled, they have full access to Shell internals — there is no further sandboxing. This extension uses that access to call `global.workspace_manager` methods and exports the results over a custom D-Bus interface. It does not bypass or re-enable `Shell.Eval`.

**What these methods can do:** Switch workspaces and read workspace count. Equivalent to pressing `Super+Arrow`.

**What these methods cannot do:** Read window content or titles, capture screenshots, monitor keystrokes or clipboard, execute arbitrary code, access the filesystem.

**Who can call them:** Any unsandboxed process running as your user. Flatpak apps are filtered by default (would need explicit `--talk-name=org.gnome.Shell` permission). Snap apps are blocked by AppArmor.

**The trust boundary is enabling the extension.** Same as any GNOME extension — review the code before you enable it.

## License

MIT
