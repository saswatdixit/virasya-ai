PYTHON ?= .venv/bin/python

.PHONY: test

test:
	@test -x "$(PYTHON)" || (echo "Missing $(PYTHON); create the project virtual environment first." >&2; exit 1)
	"$(PYTHON)" -m pytest -q tests phases
