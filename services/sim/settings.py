from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class Settings(BaseModel):
    app_name: str = Field(default=os.getenv("APP_NAME", "Simulation Service"))
    default_trials: int = Field(default=int(os.getenv("SIM_DEFAULT_TRIALS", "2000")), gt=0)
    max_trials: int = Field(default=int(os.getenv("SIM_MAX_TRIALS", "20000")), gt=0)
    min_trials: int = Field(default=int(os.getenv("SIM_MIN_TRIALS", "100")), gt=0)
    histogram_bins: int = Field(default=int(os.getenv("SIM_HISTOGRAM_BINS", "18")), gt=3)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
