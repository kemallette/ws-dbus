import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const IFACE = `
<node>
  <interface name="com.kemallette.Workspace">
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
        this._dbus.export(Gio.DBus.session, '/com/kemallette/Workspace');

        const wm = global.workspace_manager;
        this._lastActive = wm.get_active_workspace_index();

        this._signals = [
            wm.connect('active-workspace-changed', () => {
                const newIndex = wm.get_active_workspace_index();
                this._dbus.emit_signal('WorkspaceSwitched',
                    new GLib.Variant('(ii)', [this._lastActive, newIndex]));
                this._lastActive = newIndex;
            }),
            wm.connect('workspace-added', () => {
                this._dbus.emit_signal('WorkspaceAdded',
                    new GLib.Variant('(i)', [wm.get_n_workspaces()]));
            }),
            wm.connect('workspace-removed', () => {
                this._dbus.emit_signal('WorkspaceRemoved',
                    new GLib.Variant('(i)', [wm.get_n_workspaces()]));
            }),
        ];
    }

    disable() {
        const wm = global.workspace_manager;
        for (const id of this._signals)
            wm.disconnect(id);
        this._signals = null;
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
}
