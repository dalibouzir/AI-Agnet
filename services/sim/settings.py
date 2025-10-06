import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()


class Settings(BaseModel):
    app_name: str = os.getenv("APP_NAME", "Simulation Service")
    default_trials: int = int(os.getenv("SIM_DEFAULT_TRIALS", "100"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
