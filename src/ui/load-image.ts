const images = new Map<string, Promise<HTMLImageElement>>();

/** Loads and decodes an image once; later calls share the result. */
export function loadImage(src: string): Promise<HTMLImageElement> {
    let image = images.get(src);
    if (!image) {
        const element = new Image();
        element.src = src;
        image = element.decode().then(() => element);
        images.set(src, image);
    }
    return image;
}
