import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const IFACE = `
<node>
  <interface name="org.gnome.Shell.Extensions.WsDbus">
    <method name="Switch">
      <arg type="i" direction="in" name="index"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="SwitchToNew">
      <arg type="i" direction="out" name="index"/>
    </method>
    <method name="GetCount">
      <arg type="i" direction="out" name="count"/>
    </method>
    <method name="GetActive">
      <arg type="i" direction="out" name="index"/>
    </method>
    <method name="ListWindows">
      <arg type="i" direction="in" name="workspaceIndex"/>
      <arg type="s" direction="out" name="windows"/>
    </method>
    <method name="MoveToWorkspace">
      <arg type="u" direction="in" name="windowId"/>
      <arg type="i" direction="in" name="workspaceIndex"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="MoveResize">
      <arg type="u" direction="in" name="windowId"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="i" direction="in" name="width"/>
      <arg type="i" direction="in" name="height"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="Maximize">
      <arg type="u" direction="in" name="windowId"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="Focus">
      <arg type="u" direction="in" name="windowId"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="Unmaximize">
      <arg type="u" direction="in" name="windowId"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="Minimize">
      <arg type="u" direction="in" name="windowId"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="Unminimize">
      <arg type="u" direction="in" name="windowId"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="Fullscreen">
      <arg type="u" direction="in" name="windowId"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="Unfullscreen">
      <arg type="u" direction="in" name="windowId"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="GetWorkArea">
      <arg type="s" direction="out" name="workArea"/>
    </method>
    <signal name="WorkspaceSwitched">
      <arg type="i" name="oldIndex"/>
      <arg type="i" name="newIndex"/>
    </signal>
    <signal name="WorkspaceAdded">
      <arg type="i" name="count"/>
    </signal>
    <signal name="WorkspaceRemoved">
      <arg type="i" name="count"/>
    </signal>
  </interface>
</node>`;

export default class WorkspaceDbus extends Extension {
    enable() {
        this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/WsDbus');

        const wm = global.workspace_manager;
        this._lastActive = wm.get_active_workspace_index();

        wm.connectObject(
            'active-workspace-changed', () => {
                const newIndex = wm.get_active_workspace_index();
                this._dbus.emit_signal('WorkspaceSwitched',
                    new GLib.Variant('(ii)', [this._lastActive, newIndex]));
                this._lastActive = newIndex;
            },
            'workspace-added', () => {
                this._dbus.emit_signal('WorkspaceAdded',
                    new GLib.Variant('(i)', [wm.get_n_workspaces()]));
            },
            'workspace-removed', () => {
                this._dbus.emit_signal('WorkspaceRemoved',
                    new GLib.Variant('(i)', [wm.get_n_workspaces()]));
            },
            this);
    }

    disable() {
        global.workspace_manager.disconnectObject(this);
        this._lastActive = null;

        if (this._dbus) {
            this._dbus.unexport();
            this._dbus = null;
        }
    }

    Switch(index) {
        const wm = global.workspace_manager;
        if (index < 0 || index >= wm.get_n_workspaces())
            return false;
        wm.get_workspace_by_index(index).activate(global.get_current_time());
        return true;
    }

    SwitchToNew() {
        const wm = global.workspace_manager;
        const count = wm.get_n_workspaces();
        wm.append_new_workspace(false, global.get_current_time());
        wm.get_workspace_by_index(count).activate(global.get_current_time());
        return count;
    }

    GetCount() {
        return global.workspace_manager.get_n_workspaces();
    }

    GetActive() {
        return global.workspace_manager.get_active_workspace_index();
    }

    ListWindows(workspaceIndex) {
        const wm = global.workspace_manager;
        const total = wm.get_n_workspaces();
        let indices;

        if (workspaceIndex < 0) {
            indices = Array.from({length: total}, (_, i) => i);
        } else if (workspaceIndex >= total) {
            return '[]';
        } else {
            indices = [workspaceIndex];
        }

        const result = [];
        for (const wsIndex of indices) {
            for (const win of wm.get_workspace_by_index(wsIndex).list_windows()) {
                if (win.is_skip_taskbar())
                    continue;
                result.push({
                    id: win.get_id(),
                    workspace: wsIndex,
                    wm_class: win.get_wm_class() || '',
                    title: win.get_title() || '',
                    pid: win.get_pid(),
                });
            }
        }
        return JSON.stringify(result);
    }

    MoveToWorkspace(windowId, workspaceIndex) {
        const wm = global.workspace_manager;
        if (workspaceIndex < 0 || workspaceIndex >= wm.get_n_workspaces())
            return false;
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_id() === windowId) {
                actor.meta_window.change_workspace_by_index(workspaceIndex, false);
                return true;
            }
        }
        return false;
    }

    MoveResize(windowId, x, y, width, height) {
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_id() === windowId) {
                const win = actor.meta_window;
                win.unmaximize(3); // Meta.MaximizeFlags.BOTH
                win.move_resize_frame(true, x, y, width, height);
                return true;
            }
        }
        return false;
    }

    Maximize(windowId) {
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_id() === windowId) {
                actor.meta_window.maximize(3); // Meta.MaximizeFlags.BOTH
                return true;
            }
        }
        return false;
    }

    Focus(windowId) {
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_id() === windowId) {
                actor.meta_window.activate(global.get_current_time());
                return true;
            }
        }
        return false;
    }

    Unmaximize(windowId) {
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_id() === windowId) {
                actor.meta_window.unmaximize(3); // Meta.MaximizeFlags.BOTH
                return true;
            }
        }
        return false;
    }

    Minimize(windowId) {
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_id() === windowId) {
                actor.meta_window.minimize();
                return true;
            }
        }
        return false;
    }

    Unminimize(windowId) {
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_id() === windowId) {
                actor.meta_window.unminimize();
                return true;
            }
        }
        return false;
    }

    Fullscreen(windowId) {
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_id() === windowId) {
                actor.meta_window.make_fullscreen();
                return true;
            }
        }
        return false;
    }

    Unfullscreen(windowId) {
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_id() === windowId) {
                actor.meta_window.unmake_fullscreen();
                return true;
            }
        }
        return false;
    }

    GetWorkArea() {
        const monitor = global.display.get_primary_monitor();
        const area = global.workspace_manager
            .get_active_workspace()
            .get_work_area_for_monitor(monitor);
        return JSON.stringify({
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height,
        });
    }
}
