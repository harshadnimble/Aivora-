export default function VideoCaptionToolRunner() {
  return (
    <div className="card overflow-hidden p-0" style={{ height: "calc(100vh - 16rem)", minHeight: 720 }}>
      <iframe
        src="/tools/video-caption-generator.html"
        title="Video Caption Generator"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
