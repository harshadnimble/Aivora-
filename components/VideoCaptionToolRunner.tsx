export default function VideoCaptionToolRunner() {
  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-black">
      <iframe
        src="/tools/video-caption-generator.html"
        title="Video Caption Generator"
        className="h-screen w-screen border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
