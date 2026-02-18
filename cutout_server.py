from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rembg import remove
from PIL import Image
import base64, io

app = FastAPI()

# allow CORS for all origins (for testing purposes, adjust in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CutoutReq(BaseModel):
    image_data_url: str  # "data:image/png;base64,...."

def dataurl_to_bytes(data_url: str) -> bytes:
    # data:image/png;base64,xxxx
    header, b64 = data_url.split(",", 1)
    return base64.b64decode(b64)

def bytes_to_dataurl_png(b: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(b).decode("utf-8")

@app.post("/cutout")
def cutout(req: CutoutReq):
    img_bytes = dataurl_to_bytes(req.image_data_url)

    # Use rembg to remove the background
    out_bytes = remove(img_bytes)

    return {"png_data_url": bytes_to_dataurl_png(out_bytes)}