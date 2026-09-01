# POLARISIS Quick Start

From the repository root:

```bash
./run-project.sh
```

This creates or reuses `backend/venv`, installs missing dependencies, and starts the FastAPI backend and Vite frontend together. Press `Ctrl+C` to stop both services.

Open the dashboard at http://localhost:5173. The API is at http://localhost:8000 and interactive API documentation is at http://localhost:8000/docs.

For architecture, API payloads, NCPOR fallback rules, simulation behavior, configuration, Docker, C++ integration, verification, and limitations, see [README.md](README.md).

To run the services independently:

```bash
./run-backend.sh
./run-frontend.sh
```

Run those commands in separate terminals. The optional C++ client can be built with `./build-cpp-client.sh`.
