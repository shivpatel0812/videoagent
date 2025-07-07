import os
import cv2
import numpy as np
import tensorflow as tf
from typing import List, Dict, Any, Optional, Tuple
import asyncio
import aiofiles
from pathlib import Path
import json
import uuid
from datetime import datetime

from app.models.schemas import (
    VideoMetadata, ObjectDetection, Movement, ZoneInteraction, 
    PersonAttribute, TemporalData, ProcessingUpdate
)

class VideoProcessor:
    def __init__(self, output_dir: str = "./output"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.model = None
        
    async def initialize(self):
        try:
            from tensorflow.keras.applications import MobileNetV2
            from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
            
            print("Loading TensorFlow model...")
            self.model = tf.saved_model.load('path/to/coco_ssd_model')
            print("Model loaded successfully")
        except Exception as e:
            print(f"Warning: Could not load TensorFlow model: {e}")
            self.model = None

    async def get_video_metadata(self, video_path: str) -> VideoMetadata:
        cap = cv2.VideoCapture(video_path)
        
        if not cap.isOpened():
            raise ValueError("Could not open video file")
        
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frame_count / fps if fps > 0 else 0
        
        cap.release()
        
        file_size = os.path.getsize(video_path)
        
        return VideoMetadata(
            duration=duration,
            width=width,
            height=height,
            frame_rate=fps,
            size=file_size
        )

    async def extract_frames(self, video_path: str, job_id: str, frame_rate: float = 0.5) -> List[str]:
        cap = cv2.VideoCapture(video_path)
        frames_dir = self.output_dir / job_id / "frames"
        frames_dir.mkdir(parents=True, exist_ok=True)
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_interval = int(fps / frame_rate) if fps > 0 else 30
        
        frame_paths = []
        frame_count = 0
        saved_count = 0
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            if frame_count % frame_interval == 0:
                frame_filename = f"frame_{saved_count:04d}.jpg"
                frame_path = frames_dir / frame_filename
                
                cv2.imwrite(str(frame_path), frame)
                frame_paths.append(str(frame_path))
                saved_count += 1
            
            frame_count += 1
        
        cap.release()
        return frame_paths

    def detect_objects_simple(self, image: np.ndarray) -> List[Dict]:
        if image is None:
            return []
        
        height, width = image.shape[:2]
        
        mock_detections = []
        
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for i, contour in enumerate(contours[:10]):
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            
            if area > 1000:
                confidence = min(0.5 + (area / 10000), 0.95)
                
                if area > 5000:
                    object_class = "person"
                elif area > 2000:
                    object_class = "car" if w > h else "person"
                else:
                    object_class = "object"
                
                mock_detections.append({
                    "class": object_class,
                    "score": confidence,
                    "bbox": [float(x), float(y), float(w), float(h)]
                })
        
        return mock_detections

    async def detect_objects_in_frames(self, frame_paths: List[str], job_id: str) -> List[ObjectDetection]:
        detections = []
        
        for i, frame_path in enumerate(frame_paths):
            image = cv2.imread(frame_path)
            timestamp = i * 2.0
            
            predictions = self.detect_objects_simple(image)
            
            for j, pred in enumerate(predictions):
                if pred["score"] > 0.5:
                    detection = ObjectDetection(
                        object_id=f"{job_id}_{i}_{j}",
                        object_type=pred["class"],
                        confidence=pred["score"],
                        bbox={
                            "x": pred["bbox"][0],
                            "y": pred["bbox"][1],
                            "width": pred["bbox"][2],
                            "height": pred["bbox"][3]
                        },
                        frame_number=i + 1,
                        timestamp=timestamp,
                        size=pred["bbox"][2] * pred["bbox"][3],
                        aspect_ratio=pred["bbox"][2] / pred["bbox"][3] if pred["bbox"][3] > 0 else 1.0
                    )
                    detections.append(detection)
        
        return detections

    async def extract_movements(self, detections: List[ObjectDetection]) -> List[Movement]:
        movements = []
        previous_objects = {}
        
        for detection in detections:
            obj_type = detection.object_type
            current_center = {
                "x": detection.bbox["x"] + detection.bbox["width"] / 2,
                "y": detection.bbox["y"] + detection.bbox["height"] / 2
            }
            
            if obj_type in previous_objects:
                prev_center = previous_objects[obj_type]
                
                distance = np.sqrt(
                    (current_center["x"] - prev_center["x"]) ** 2 + 
                    (current_center["y"] - prev_center["y"]) ** 2
                )
                
                if 20 < distance < 300:
                    direction = self.calculate_direction(prev_center, current_center)
                    speed = distance / 2.0
                    
                    movement = Movement(
                        object_type=obj_type,
                        distance=distance,
                        direction=direction,
                        speed=speed,
                        timestamp=detection.timestamp,
                        start_point=prev_center,
                        end_point=current_center
                    )
                    movements.append(movement)
            
            previous_objects[obj_type] = current_center
        
        return movements

    def calculate_direction(self, from_point: Dict[str, float], to_point: Dict[str, float]) -> str:
        dx = to_point["x"] - from_point["x"]
        dy = to_point["y"] - from_point["y"]
        angle = np.arctan2(dy, dx) * 180 / np.pi
        
        if -45 <= angle < 45:
            return "right"
        elif 45 <= angle < 135:
            return "down"
        elif 135 <= angle or angle < -135:
            return "left"
        else:
            return "up"

    async def define_zones(self, width: int, height: int) -> Dict[str, Any]:
        return {
            "zones": [
                {"name": "top", "bounds": {"x": 0, "y": 0, "width": width, "height": height * 0.3}},
                {"name": "middle", "bounds": {"x": 0, "y": height * 0.3, "width": width, "height": height * 0.4}},
                {"name": "bottom", "bounds": {"x": 0, "y": height * 0.7, "width": width, "height": height * 0.3}},
                {"name": "left", "bounds": {"x": 0, "y": 0, "width": width * 0.3, "height": height}},
                {"name": "center", "bounds": {"x": width * 0.3, "y": 0, "width": width * 0.4, "height": height}},
                {"name": "right", "bounds": {"x": width * 0.7, "y": 0, "width": width * 0.3, "height": height}},
                {"name": "door_area", "bounds": {"x": width * 0.4, "y": height * 0.1, "width": width * 0.2, "height": height * 0.8}}
            ]
        }

    async def extract_zone_interactions(self, detections: List[ObjectDetection], zones: Dict[str, Any]) -> List[ZoneInteraction]:
        interactions = []
        
        for detection in detections:
            center_x = detection.bbox["x"] + detection.bbox["width"] / 2
            center_y = detection.bbox["y"] + detection.bbox["height"] / 2
            
            for zone in zones["zones"]:
                bounds = zone["bounds"]
                if (bounds["x"] <= center_x <= bounds["x"] + bounds["width"] and
                    bounds["y"] <= center_y <= bounds["y"] + bounds["height"]):
                    
                    interaction = ZoneInteraction(
                        object_type=detection.object_type,
                        zone_name=zone["name"],
                        timestamp=detection.timestamp,
                        confidence=detection.confidence,
                        object_id=detection.object_id
                    )
                    interactions.append(interaction)
        
        return interactions

    async def extract_person_attributes(self, detections: List[ObjectDetection]) -> List[PersonAttribute]:
        attributes = []
        
        for detection in detections:
            if detection.object_type == "person":
                estimated_gender = "likely_male" if detection.aspect_ratio > 0.4 else "likely_female"
                estimated_age = "adult" if detection.size > 8000 else "child"
                size_category = "large" if detection.size > 10000 else "medium" if detection.size > 5000 else "small"
                
                center_y = detection.bbox["y"] + detection.bbox["height"] / 2
                position = "top" if center_y < 200 else "bottom" if center_y > 400 else "center"
                
                attribute = PersonAttribute(
                    object_id=detection.object_id,
                    estimated_gender=estimated_gender,
                    estimated_age=estimated_age,
                    size_category=size_category,
                    position=position,
                    timestamp=detection.timestamp
                )
                attributes.append(attribute)
        
        return attributes

    async def extract_temporal_data(self, detections: List[ObjectDetection], movements: List[Movement]) -> List[TemporalData]:
        temporal_data = []
        timestamps = list(set(d.timestamp for d in detections))
        timestamps.sort()
        
        for timestamp in timestamps:
            frame_detections = [d for d in detections if d.timestamp == timestamp]
            frame_movements = [m for m in movements if m.timestamp == timestamp]
            
            object_types = list(set(d.object_type for d in frame_detections))
            avg_confidence = sum(d.confidence for d in frame_detections) / len(frame_detections) if frame_detections else 0
            
            temporal = TemporalData(
                timestamp=timestamp,
                total_objects=len(frame_detections),
                object_types=object_types,
                avg_confidence=avg_confidence,
                total_movements=len(frame_movements),
                active_zones=[]
            )
            temporal_data.append(temporal)
        
        return temporal_data

    async def cleanup_temp_files(self, job_id: str):
        job_dir = self.output_dir / job_id
        if job_dir.exists():
            import shutil
            shutil.rmtree(job_dir)