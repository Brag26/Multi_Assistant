# backend/tests/conftest.py
"""
Shared fixtures for all tests.
Provides a lightweight async session factory using aiosqlite/SQLite
for tests that need real database queries.
"""
import pytest
import pytest_asyncio

# ─── asyncio mode ────────────────────────────────────────────────────────────
# pyproject.toml / pytest.ini should set asyncio_mode = "auto"
# but we also set it here for safety.


@pytest.fixture(scope="session")
def event_loop_policy():
    """Use default asyncio event loop policy."""
    import asyncio
    return asyncio.DefaultEventLoopPolicy()


# ─── In-memory DB session (optional, for repo integration tests) ──────────────
# Uncomment and install aiosqlite + pytest-asyncio to enable.
#
# @pytest_asyncio.fixture
# async def async_session():
#     from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
#     from sqlalchemy.orm import sessionmaker
#     from app.infrastructure.db.base import Base
#
#     engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
#     async with engine.begin() as conn:
#         await conn.run_sync(Base.metadata.create_all)
#     factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
#     async with factory() as session:
#         yield session
#     await engine.dispose()
