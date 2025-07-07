import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "Video Analysis API"
    app_version: str = "1.0.0"
    debug: bool = False
    
    upload_dir: str = "./uploads"
    output_dir: str = "./output"
    max_file_size: int = 500 * 1024 * 1024  # 500MB
    
    anthropic_api_key: str = ""
    
    cors_origins: list = ["http://localhost:3000"]
    
    database_url: str = "sqlite:///./video_analysis.db"
    
    class Config:
        env_file = ".env"

settings = Settings()