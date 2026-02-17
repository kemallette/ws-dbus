UUID = ws-dbus@kemallette
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SOURCES = extension.js metadata.json

.PHONY: install uninstall pack test enable disable

install: $(SOURCES)
	mkdir -p $(EXT_DIR)
	cp $(SOURCES) $(EXT_DIR)/
	@echo ""
	@echo "Installed to $(EXT_DIR)"
	@echo "Log out and back in, then run: make enable"

uninstall:
	gnome-extensions disable $(UUID) 2>/dev/null || true
	rm -rf $(EXT_DIR)
	@echo "Uninstalled. Log out and back in to complete removal."

pack: $(SOURCES)
	gnome-extensions pack --force --out-dir=. .
	@echo "Built $(UUID).shell-extension.zip"

test:
	bats test.bats

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)
