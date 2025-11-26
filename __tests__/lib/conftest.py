"""
Pytest configuration for lib tests.

Sets up fixtures and configuration for testing Python lib modules.
"""

import sys
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

import pytest


@pytest.fixture
def project_root_path():
    """Return the project root path."""
    return project_root
