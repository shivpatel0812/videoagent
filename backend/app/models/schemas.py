from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class ProcessingStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class VideoUploadResponse(BaseModel):
    job_id: str
    message: str
    filename: str

class JobStatus(BaseModel):
    job_id: str
    status: ProcessingStatus
    progress: int
    message: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class VideoMetadata(BaseModel):
    duration: float
    width: int
    height: int
    frame_rate: float
    size: int
    codec: Optional[str] = None

class ObjectDetection(BaseModel):
    object_id: str
    object_type: str
    confidence: float
    bbox: Dict[str, float]
    frame_number: int
    timestamp: float
    size: float
    aspect_ratio: float

class Movement(BaseModel):
    object_type: str
    distance: float
    direction: str
    speed: float
    timestamp: float
    start_point: Dict[str, float]
    end_point: Dict[str, float]

class ZoneInteraction(BaseModel):
    object_type: str
    zone_name: str
    timestamp: float
    confidence: float
    object_id: str

class PersonAttribute(BaseModel):
    object_id: str
    estimated_gender: Optional[str] = None
    estimated_age: Optional[str] = None
    size_category: str
    position: str
    timestamp: float

class TemporalData(BaseModel):
    timestamp: float
    total_objects: int
    object_types: List[str]
    avg_confidence: float
    total_movements: int
    active_zones: List[str]

class VideoAnalysisResult(BaseModel):
    job_id: str
    total_frames: int
    objects_detected: int
    movements_tracked: int
    zone_interactions: int
    attribute_data: int
    summary: Dict[str, Any]
    video_metadata: VideoMetadata

class QueryRequest(BaseModel):
    query: str

class QueryResponse(BaseModel):
    answer: str
    confidence: float
    sources: List[Dict[str, Any]]

class ProcessingUpdate(BaseModel):
    job_id: str
    status: str
    progress: int
    message: Optional[str] = None
    current_step: Optional[str] = None