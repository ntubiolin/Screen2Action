export interface ImageAnnotation {
  type: 'boundingBox' | 'crop' | 'arrow';
  coordinates: number[];
  color?: string;
  label?: string;
}

export class ImageManipulator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create canvas context');
    }
    this.ctx = ctx;
  }

  async loadImage(imagePath: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;
    });
  }

  async applyAnnotations(
    imagePath: string,
    annotations: ImageAnnotation[]
  ): Promise<string> {
    const img = await this.loadImage(imagePath);
    
    // Set initial canvas size to match image
    this.canvas.width = img.width;
    this.canvas.height = img.height;

    // Process annotations in order
    let currentImage = img;
    let isCropped = false;

    for (const annotation of annotations) {
      if (annotation.type === 'crop') {
        // Apply crop first if present
        const [x, y, width, height] = annotation.coordinates;
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.drawImage(currentImage, x, y, width, height, 0, 0, width, height);
        isCropped = true;
        
        // Create a new image from the cropped canvas for further annotations
        const croppedDataUrl = this.canvas.toDataURL();
        currentImage = await this.loadImage(croppedDataUrl);
      }
    }

    // If not cropped, draw the original image
    if (!isCropped) {
      this.ctx.drawImage(currentImage, 0, 0);
    }

    // Apply other annotations on top
    for (const annotation of annotations) {
      if (annotation.type === 'boundingBox') {
        this.drawBoundingBox(annotation);
      } else if (annotation.type === 'arrow') {
        this.drawArrow(annotation);
      }
    }

    return this.canvas.toDataURL('image/png');
  }

  private drawBoundingBox(annotation: ImageAnnotation) {
    const [x, y, width, height] = annotation.coordinates;
    const color = annotation.color || '#FF0000';
    
    // Draw rectangle
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(x, y, width, height);
    
    // Draw label if provided
    if (annotation.label) {
      this.ctx.fillStyle = color;
      this.ctx.font = 'bold 16px Arial';
      const textMetrics = this.ctx.measureText(annotation.label);
      const padding = 4;
      
      // Draw label background
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(
        x,
        y - 20 - padding,
        textMetrics.width + padding * 2,
        20 + padding
      );
      
      // Draw label text
      this.ctx.fillStyle = color;
      this.ctx.fillText(annotation.label, x + padding, y - padding);
    }
  }

  private drawArrow(annotation: ImageAnnotation) {
    const [targetX, targetY] = annotation.coordinates;
    const color = annotation.color || '#FF0000';
    
    // Arrow properties
    const arrowLength = 60;
    const arrowHeadLength = 20;
    const arrowHeadAngle = Math.PI / 6; // 30 degrees
    
    // Calculate arrow start point (pointing from bottom to target)
    const startX = targetX;
    const startY = targetY + arrowLength;
    
    // Draw arrow shaft
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.lineTo(targetX, targetY);
    this.ctx.stroke();
    
    // Draw arrow head
    const angle = Math.atan2(targetY - startY, targetX - startX);
    
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(targetX, targetY);
    this.ctx.lineTo(
      targetX - arrowHeadLength * Math.cos(angle - arrowHeadAngle),
      targetY - arrowHeadLength * Math.sin(angle - arrowHeadAngle)
    );
    this.ctx.lineTo(
      targetX - arrowHeadLength * Math.cos(angle + arrowHeadAngle),
      targetY - arrowHeadLength * Math.sin(angle + arrowHeadAngle)
    );
    this.ctx.closePath();
    this.ctx.fill();
  }

  async saveProcessedImage(dataUrl: string, filename: string): Promise<string> {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    
    // Create a temporary file path
    const tempPath = `/tmp/${filename}`;
    
    // Convert blob to buffer and save
    const buffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    
    // Note: In a real implementation, you'd use the main process to save the file
    // This is a simplified version for demonstration
    return tempPath;
  }
}

// Parse LLM response to extract annotations
export function parseLLMAnnotations(response: string): ImageAnnotation[] {
  const annotations: ImageAnnotation[] = [];
  
  // Example parsing logic - this would need to be adapted based on LLM response format
  // Looking for patterns like:
  // - "bounding box at (x, y, width, height)"
  // - "crop to (x, y, width, height)"
  // - "arrow pointing to (x, y)"
  
  const boundingBoxRegex = /bounding box.*?(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/gi;
  const cropRegex = /crop.*?(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/gi;
  const arrowRegex = /arrow.*?(\d+),\s*(\d+)/gi;
  
  let match;
  
  while ((match = boundingBoxRegex.exec(response)) !== null) {
    annotations.push({
      type: 'boundingBox',
      coordinates: [
        parseInt(match[1]),
        parseInt(match[2]),
        parseInt(match[3]),
        parseInt(match[4])
      ],
      color: '#FF0000'
    });
  }
  
  while ((match = cropRegex.exec(response)) !== null) {
    annotations.push({
      type: 'crop',
      coordinates: [
        parseInt(match[1]),
        parseInt(match[2]),
        parseInt(match[3]),
        parseInt(match[4])
      ]
    });
  }
  
  while ((match = arrowRegex.exec(response)) !== null) {
    annotations.push({
      type: 'arrow',
      coordinates: [
        parseInt(match[1]),
        parseInt(match[2])
      ],
      color: '#FF0000'
    });
  }
  
  return annotations;
}