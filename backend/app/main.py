from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import socketio
import uvicorn
import os
import uuid
import asyncio
from datetime import datetime
from typing import Dict, Any

from app.core.config import settings
from app.models.schemas import (
    VideoUploadResponse, JobStatus, ProcessingStatus, 
    QueryRequest, QueryResponse, VideoAnalysisResult
)
from app.services.simple_processor import SimpleVideoProcessor

app = FastAPI(title=settings.app_name, version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=settings.cors_origins
)

socket_app = socketio.ASGIApp(sio, app)

video_processor = SimpleVideoProcessor(settings.output_dir)
jobs: Dict[str, Dict[str, Any]] = {}

@app.on_event("startup")
async def startup_event():
    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(settings.output_dir, exist_ok=True)
    await video_processor.initialize()

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now()}

@app.get("/jobs")
async def list_all_jobs():
    return {
        "total_jobs": len(jobs),
        "jobs": [
            {
                "job_id": job_id,
                "status": job_data["status"],
                "filename": job_data["filename"],
                "created_at": job_data["created_at"]
            }
            for job_id, job_data in jobs.items()
        ]
    }

@app.post("/upload", response_model=VideoUploadResponse)
async def upload_video(video: UploadFile = File(...)):
    if video.content_type not in ["video/mp4", "video/mov", "video/avi", "video/mkv"]:
        raise HTTPException(status_code=400, detail="Unsupported video format")
    
    if video.size and video.size > settings.max_file_size:
        raise HTTPException(status_code=400, detail="File too large")
    
    job_id = str(uuid.uuid4())
    filename = f"{job_id}_{video.filename}"
    file_path = os.path.join(settings.upload_dir, filename)
    
    try:
        with open(file_path, "wb") as buffer:
            content = await video.read()
            buffer.write(content)
        
        jobs[job_id] = {
            "status": ProcessingStatus.UPLOADED,
            "progress": 0,
            "filename": video.filename,
            "file_path": file_path,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        return VideoUploadResponse(
            job_id=job_id,
            message="Video uploaded successfully",
            filename=video.filename
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.get("/status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    return JobStatus(
        job_id=job_id,
        status=job["status"],
        progress=job["progress"],
        message=job.get("message"),
        error=job.get("error"),
        created_at=job["created_at"],
        updated_at=job["updated_at"]
    )

@app.post("/process/{job_id}")
async def start_processing(job_id: str, background_tasks: BackgroundTasks):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    if job["status"] != ProcessingStatus.UPLOADED:
        raise HTTPException(status_code=400, detail="Job not ready for processing")
    
    background_tasks.add_task(process_video_background, job_id)
    
    jobs[job_id]["status"] = ProcessingStatus.PROCESSING
    jobs[job_id]["updated_at"] = datetime.now()
    
    return {"message": "Processing started"}

async def process_video_background(job_id: str):
    try:
        job = jobs[job_id]
        video_path = job["file_path"]
        
        print(f"🎬 Starting processing for job {job_id}")
        print(f"📁 Video path: {video_path}")
        
        await update_job_progress(job_id, 10, "Getting video metadata...")
        metadata = await video_processor.get_video_metadata(video_path)
        print(f"📊 Video metadata: {metadata.duration}s, {metadata.width}x{metadata.height}")
        
        await update_job_progress(job_id, 20, "Extracting frames...")
        frame_paths = await video_processor.extract_frames(video_path, job_id)
        print(f"🖼️ Extracted {len(frame_paths)} frames")
        
        await update_job_progress(job_id, 40, "Detecting objects...")
        detections = await video_processor.detect_objects_in_frames(frame_paths, job_id)
        print(f"👁️ Detected {len(detections)} objects")
        
        await update_job_progress(job_id, 60, "Analyzing movements...")
        movements = await video_processor.extract_movements(detections)
        
        await update_job_progress(job_id, 70, "Processing zones...")
        zones = await video_processor.define_zones(metadata.width, metadata.height)
        zone_interactions = await video_processor.extract_zone_interactions(detections, zones)
        
        await update_job_progress(job_id, 80, "Extracting attributes...")
        attributes = await video_processor.extract_person_attributes(detections)
        
        await update_job_progress(job_id, 90, "Creating temporal analysis...")
        temporal_data = await video_processor.extract_temporal_data(detections, movements)
        
        people_count = len(set(d.object_id for d in detections if d.object_type == "person"))
        peak_activity = max(temporal_data, key=lambda x: x.total_objects) if temporal_data else None
        
        result = {
            "job_id": job_id,
            "total_frames": len(frame_paths),
            "objects_detected": len(detections),
            "movements_tracked": len(movements),
            "zone_interactions": len(zone_interactions),
            "attribute_data": len(attributes),
            "video_metadata": metadata.dict(),
            "summary": {
                "unique_people": people_count,
                "total_objects": len(detections),
                "peak_activity": {
                    "timestamp": peak_activity.timestamp if peak_activity else 0,
                    "object_count": peak_activity.total_objects if peak_activity else 0
                }
            },
            "detections": [d.dict() for d in detections],
            "movements": [m.dict() for m in movements],
            "zone_interactions": [z.dict() for z in zone_interactions],
            "attributes": [a.dict() for a in attributes],
            "temporal_data": [t.dict() for t in temporal_data]
        }
        
        jobs[job_id]["result"] = result
        jobs[job_id]["status"] = ProcessingStatus.COMPLETED
        jobs[job_id]["progress"] = 100
        jobs[job_id]["message"] = "Processing completed successfully"
        jobs[job_id]["updated_at"] = datetime.now()
        
        await sio.emit("processing_complete", result, room=job_id)
        await video_processor.cleanup_temp_files(job_id)
        
    except Exception as e:
        jobs[job_id]["status"] = ProcessingStatus.FAILED
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["updated_at"] = datetime.now()
        
        await sio.emit("processing_error", {"message": str(e)}, room=job_id)

async def update_job_progress(job_id: str, progress: int, message: str = None):
    jobs[job_id]["progress"] = progress
    jobs[job_id]["updated_at"] = datetime.now()
    if message:
        jobs[job_id]["message"] = message
    
    await sio.emit("processing_update", {
        "job_id": job_id,
        "status": "processing",
        "progress": progress,
        "message": message,
        "current_step": message
    }, room=job_id)

@app.get("/results/{job_id}", response_model=VideoAnalysisResult)
async def get_analysis_results(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    if job["status"] != ProcessingStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Job not completed")
    
    result = job["result"]
    return VideoAnalysisResult(**result)

@app.post("/query/{job_id}", response_model=QueryResponse)
async def query_video(job_id: str, request: QueryRequest):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    if job["status"] != ProcessingStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Job not completed")
    
    result = job["result"]
    query = request.query.lower()
    
    response_text = "I couldn't find specific information about that query."
    confidence = 0.0
    sources = []
    
    if "people" in query or "person" in query:
        unique_people = result["summary"]["unique_people"]
        total_detections = len([d for d in result["detections"] if d["object_type"] == "person"])
        
        if "count" in query or "how many" in query:
            response_text = f"I detected {unique_people} unique people in the video. There were {total_detections} total person detections across all frames."
            confidence = 85.0
        elif "male" in query or "female" in query:
            gender_data = {}
            for attr in result["attributes"]:
                if attr["estimated_gender"]:
                    gender = attr["estimated_gender"]
                    gender_data[gender] = gender_data.get(gender, 0) + 1
            
            response_text = f"Based on visual analysis: {gender_data}"
            confidence = 60.0
    
    elif "movement" in query or "moving" in query:
        movements = result["movements"]
        total_movements = len(movements)
        
        directions = {}
        for movement in movements:
            direction = movement["direction"]
            directions[direction] = directions.get(direction, 0) + 1
        
        response_text = f"I tracked {total_movements} movements. Direction breakdown: {directions}"
        confidence = 80.0
    
    elif "peak" in query or "most active" in query:
        peak = result["summary"]["peak_activity"]
        response_text = f"Peak activity occurred at {peak['timestamp']}s with {peak['object_count']} objects detected."
        confidence = 90.0
    
    elif "door" in query or "zone" in query:
        door_interactions = [zi for zi in result["zone_interactions"] if zi["zone_name"] == "door_area"]
        response_text = f"There were {len(door_interactions)} interactions in the door area."
        confidence = 75.0
    
    return QueryResponse(
        answer=response_text,
        confidence=confidence,
        sources=sources
    )

@sio.event
async def connect(sid, environ):
    print(f"Client {sid} connected")

@sio.event
async def disconnect(sid):
    print(f"Client {sid} disconnected")

@sio.event
async def join_job(sid, data):
    job_id = data.get("jobId")
    if job_id:
        await sio.enter_room(sid, job_id)
        print(f"Client {sid} joined job {job_id}")

if __name__ == "__main__":
    uvicorn.run("app.main:socket_app", host="0.0.0.0", port=8000, reload=True)