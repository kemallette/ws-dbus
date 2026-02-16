import Gio from 'gi://Gio';
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
  </interface>
</node>`;

export default class WorkspaceDbus extends Extension {
    _dbus = null;

    enable() {
        this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._dbus.export(Gio.DBus.session, '/com/kemallette/Workspace');
    }

    disable() {
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
}
