#!/usr/bin/env bats
# Integration tests for ws-dbus extension.
# Requires: active GNOME Shell session with ws-dbus@kemallette enabled, jq.
# WARNING: Switches workspaces and moves windows during testing.

WS_DEST="org.gnome.Shell"
WS_PATH="/org/gnome/Shell/Extensions/WsDbus"
WS_IFACE="org.gnome.Shell.Extensions.WsDbus"

ws_call() {
    gdbus call --session --dest "$WS_DEST" \
        --object-path "$WS_PATH" \
        --method "$WS_IFACE.$1" "${@:2}" 2>/dev/null
}

ws_parse_int() {
    grep -oP '\d+'
}

ws_parse_json() {
    sed "s/^('//;s/',)$//"
}

setup_file() {
    # Verify extension is active before running any tests
    local state
    state=$(gnome-extensions info ws-dbus@kemallette 2>/dev/null | grep -oP 'State: \K.*')
    [[ "$state" == "ACTIVE" ]] || {
        echo "Extension not active. Enable it and log out/in first." >&2
        return 1
    }
    command -v jq >/dev/null 2>&1 || {
        echo "jq is required for JSON assertions." >&2
        return 1
    }
}

setup() {
    INITIAL_ACTIVE=$(ws_call GetActive | ws_parse_int)
}

teardown() {
    ws_call Switch "$INITIAL_ACTIVE" >/dev/null 2>&1 || true
    sleep 0.2
}

# --- GetCount / GetActive ----------------------------------------------------

@test "GetCount returns positive integer" {
    result=$(ws_call GetCount | ws_parse_int)
    [[ "$result" =~ ^[0-9]+$ ]]
    [[ "$result" -gt 0 ]]
}

@test "GetActive returns valid index" {
    active=$(ws_call GetActive | ws_parse_int)
    count=$(ws_call GetCount | ws_parse_int)
    [[ "$active" -ge 0 ]]
    [[ "$active" -lt "$count" ]]
}

# --- Switch ------------------------------------------------------------------

@test "Switch to invalid index returns false" {
    result=$(ws_call Switch 999)
    [[ "$result" == "(false,)" ]]
}

@test "Switch to valid index changes active workspace" {
    count=$(ws_call GetCount | ws_parse_int)
    [[ "$count" -ge 2 ]] || skip "need at least 2 workspaces"

    target=$(( (INITIAL_ACTIVE + 1) % count ))
    result=$(ws_call Switch "$target")
    [[ "$result" == "(true,)" ]]
    sleep 0.3

    active=$(ws_call GetActive | ws_parse_int)
    [[ "$active" -eq "$target" ]]
}

# --- SwitchToNew -------------------------------------------------------------

@test "SwitchToNew creates workspace and switches to it" {
    before=$(ws_call GetCount | ws_parse_int)

    new_index=$(ws_call SwitchToNew | ws_parse_int)
    sleep 0.3

    after=$(ws_call GetCount | ws_parse_int)
    [[ "$after" -eq $((before + 1)) ]]

    active=$(ws_call GetActive | ws_parse_int)
    [[ "$active" -eq "$new_index" ]]
}

# --- ListWindows -------------------------------------------------------------

@test "ListWindows with invalid index returns empty array" {
    result=$(ws_call ListWindows 999)
    [[ "$result" == "('[]',)" ]]
}

@test "ListWindows returns JSON with required fields" {
    json=$(ws_call ListWindows "$INITIAL_ACTIVE" | ws_parse_json)
    count=$(echo "$json" | jq 'length')
    [[ "$count" -gt 0 ]]

    has_fields=$(echo "$json" | jq '.[0] | (has("id") and has("workspace") and has("wm_class") and has("title") and has("pid"))')
    [[ "$has_fields" == "true" ]]
}

@test "ListWindows workspace field matches requested index" {
    json=$(ws_call ListWindows "$INITIAL_ACTIVE" | ws_parse_json)
    ws_field=$(echo "$json" | jq -r ".[0].workspace")
    [[ "$ws_field" -eq "$INITIAL_ACTIVE" ]]
}

@test "ListWindows -1 returns windows across all workspaces" {
    single=$(ws_call ListWindows "$INITIAL_ACTIVE" | ws_parse_json | jq 'length')
    all=$(ws_call ListWindows -- -1 | ws_parse_json | jq 'length')
    [[ "$all" -ge "$single" ]]
}

# --- MoveToWorkspace ---------------------------------------------------------

@test "MoveToWorkspace with invalid window ID returns false" {
    result=$(ws_call MoveToWorkspace 0 0)
    [[ "$result" == "(false,)" ]]
}

@test "MoveToWorkspace moves window and ListWindows confirms" {
    count=$(ws_call GetCount | ws_parse_int)
    [[ "$count" -ge 2 ]] || skip "need at least 2 workspaces"

    json=$(ws_call ListWindows "$INITIAL_ACTIVE" | ws_parse_json)
    win_id=$(echo "$json" | jq -r '.[0].id')
    [[ "$win_id" != "null" && -n "$win_id" ]] || skip "no windows on current workspace"

    target=$(( (INITIAL_ACTIVE + 1) % count ))

    # Move window to target
    result=$(ws_call MoveToWorkspace "$win_id" "$target")
    [[ "$result" == "(true,)" ]]
    sleep 0.3

    # Confirm it's there
    moved=$(ws_call ListWindows "$target" | ws_parse_json | jq -r ".[] | select(.id == $win_id) | .id")
    [[ "$moved" == "$win_id" ]]

    # Move it back
    ws_call MoveToWorkspace "$win_id" "$INITIAL_ACTIVE" >/dev/null
    sleep 0.3

    # Confirm it's back
    back=$(ws_call ListWindows "$INITIAL_ACTIVE" | ws_parse_json | jq -r ".[] | select(.id == $win_id) | .id")
    [[ "$back" == "$win_id" ]]
}
