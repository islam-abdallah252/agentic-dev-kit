# Python

Apply this profile only when `activeProfiles` includes `python`.

- Read the runner from the project profile (`poetry`, `pip`, `uv`, or `unknown`). Do not run npm or Angular CLI commands in a Python repository.
- Typical evidence files are `pyproject.toml`, `requirements.txt`, `poetry.lock`, and `uv.lock`. Their presence is evidence for discovery, not an automatic profile activation.
- Do not invent pytest, tox, or lint commands. Use only `commands` in the project profile.
- A missing interpreter or an unknown command is `NOT RUN` or `BLOCKED`, never `PASSED`.
