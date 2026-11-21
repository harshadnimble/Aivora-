import os
from huggingface_hub import InferenceClient

client = InferenceClient(provider="wavespeed", api_key=os.environ["HF_TOKEN"])

with open("test.jpg", "rb") as f:
    data = f.read()

result = client.image_to_image(
    data,
    prompt="Upscale this picture to 4K resolution.",
    model="joyfox/Qwen-Image-Edit-2509-Upscale2K",
)
result.save("output.png")
print("Saved output.png", result.size)
