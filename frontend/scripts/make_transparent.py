from PIL import Image

def remove_white_background(image_path, output_path, fuzz_range=30):
    try:
        img = Image.open(image_path)
        img = img.convert("RGBA")
        data = img.getdata()
        
        new_data = []
        for item in data:
            # item is (R, G, B, A)
            r, g, b, a = item
            # pure white is 255, 255, 255
            # apply simple fuzz range
            if r > 255 - fuzz_range and g > 255 - fuzz_range and b > 255 - fuzz_range:
                # Make transparent
                new_data.append((255, 255, 255, 0))
            else:
                new_data.append(item)
                
        img.putdata(new_data)
        img.save(output_path, "PNG")
        print(f"✅ Successfully created transparent image at {output_path}")
    except Exception as e:
        print(f"❌ Failed to process image: {e}")

if __name__ == "__main__":
    remove_white_background("../assets/ride.png", "../assets/ride_transparent.png", 50)
