import { useContext, useEffect, useRef } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { useSoundToggle, VideoVolumeContext } from "../../ui/sound/context.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import type { VideoElement } from "./definition.ts";
import "./style.css";

export function VideoView({ element }: ElementViewProps<VideoElement>) {
    const terminal = useTerminal();
    const video = useRef<HTMLVideoElement>(null);
    const sound = useSoundToggle();
    const volume = useContext(VideoVolumeContext);
    const muted = element.muted || sound?.muted === true;

    useEffect(() => {
        const element = video.current;
        if (!element) return;
        element.volume = Math.min(1, Math.max(0, volume));
        element.muted = muted;
        // (a browser that won't play it with sound yet plays it silently)
        element.play().catch(() => {
            element.muted = true;
            element.play().catch(() => {});
        });
    }, [muted, volume]);

    const expand = () =>
        terminal.openView({
            src: element.src,
            kind: "video",
            fit: "contain",
            loop: element.loop,
            muted: false,
            caption: element.alt,
            osd: false,
        });

    const media = (
        <video
            ref={video}
            src={element.src}
            autoPlay
            playsInline
            loop={element.loop}
            muted={muted}
            aria-label={element.alt}
            style={element.cols ? { width: `${element.cols}ch` } : undefined}
        />
    );
    return (
        <div className={classNames("video", element.className)}>
            {element.expand ? (
                <button
                    type="button"
                    className="video-expand"
                    aria-label={`${element.alt}: show it over the whole screen`}
                    onClick={expand}
                >
                    {media}
                </button>
            ) : (
                media
            )}
        </div>
    );
}
