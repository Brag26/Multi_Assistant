from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging

# Configure logging
configure_logging()
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
)

# Allowed frontend origins
ALLOWED_ORIGINS = [
    "https://multi-assistant.vercel.app",
    "http://localhost:3000",  # Local development (optional)
]

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# Global exception handler — ensures CORS headers are present even on 500s
# so the browser can actually show the real error instead of a CORS block
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url)
    origin = request.headers.get("origin", "*")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
        },
    )

# Health Check
@app.get("/healthz", tags=["Health"])
async def healthz():
    return {
        "status": "ok",
        "environment": settings.environment,
    }

# Include API routes
app.include_router(api_router, prefix="/api/v1")
