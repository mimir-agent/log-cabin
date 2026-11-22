// Cropping an image to a fixed shape before upload. The dialog shows exactly the source
// rectangle this computes, and the canvas draws exactly that rectangle, so what you saw is
// what is saved.

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** Where the crop sits: its centre as a fraction of the image, and how far it is zoomed in. */
export type CropView = { centerX: number; centerY: number; zoom: number };

export const maxZoom = 4;

/** The shapes that get cropped, and the size each is saved at. */
export const cropShapes = {
	avatar: { aspect: 1, output: { width: 512, height: 512 } },
	logo: { aspect: 1, output: { width: 512, height: 512 } },
	cover: { aspect: 3, output: { width: 1500, height: 500 } }
} as const;
export type CropShape = keyof typeof cropShapes;

/**
 * What a crop is saved as. A cover is a photo, and JPEG keeps 1500 × 500 well under the 2 MB
 * upload limit; a square keeps a PNG's transparency. A GIF loses its animation either way.
 */
export function cropEncoding(shape: CropShape, uploaded: string): string {
	if (shape === 'cover') return 'image/jpeg';
	return uploaded === 'image/jpeg' || uploaded === 'image/webp' ? uploaded : 'image/png';
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The part of the image the crop takes, in image pixels, kept inside the image. */
export function cropRect(image: Size, aspect: number, view: CropView): Rect {
	// At zoom 1 the crop is the largest rectangle of this shape that fits in the image.
	const fitsWidth = image.width / image.height <= aspect;
	const fullWidth = fitsWidth ? image.width : image.height * aspect;
	const zoom = clamp(view.zoom, 1, maxZoom);
	const width = fullWidth / zoom;
	const height = width / aspect;
	return {
		x: clamp(view.centerX * image.width - width / 2, 0, image.width - width),
		y: clamp(view.centerY * image.height - height / 2, 0, image.height - height),
		width,
		height
	};
}

/** The view after dragging the image by (dx, dy) pixels in a frame `frameWidth` wide. */
export function dragView(
	image: Size,
	aspect: number,
	view: CropView,
	dx: number,
	dy: number,
	frameWidth: number
): CropView {
	const rect = cropRect(image, aspect, view);
	const imagePixelsPerFramePixel = rect.width / frameWidth;
	// Dragging the picture right shows more of its left side: the crop moves the other way.
	const x = rect.x - dx * imagePixelsPerFramePixel;
	const y = rect.y - dy * imagePixelsPerFramePixel;
	const moved = cropRect(image, aspect, {
		zoom: view.zoom,
		centerX: (x + rect.width / 2) / image.width,
		centerY: (y + rect.height / 2) / image.height
	});
	return {
		zoom: view.zoom,
		centerX: (moved.x + moved.width / 2) / image.width,
		centerY: (moved.y + moved.height / 2) / image.height
	};
}

/** Draws the crop at the output size, encoded as `encoding`. */
export async function renderCrop(
	image: CanvasImageSource & Size,
	rect: Rect,
	output: Size,
	encoding: string
): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = output.width;
	canvas.height = output.height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('renderCrop: the browser gave no 2D canvas context');
	context.imageSmoothingQuality = 'high';
	context.drawImage(
		image,
		rect.x,
		rect.y,
		rect.width,
		rect.height,
		0,
		0,
		output.width,
		output.height
	);
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(new Error(`renderCrop: the canvas couldn't encode ${encoding}`)),
			encoding,
			0.9
		)
	);
}
