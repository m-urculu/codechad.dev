"use client";

export default function CodeHere() {
  return (
    <div className="w-full h-full p-4 font-mono font-normal leading-normal bg-neutral-900 rounded-[20px] border border-white/10 backdrop-blur-md flex flex-col">
      <textarea
        className="w-full h-full text-sm p-4 rounded-[20px] focus:outline-none bg-neutral-900 backdrop-blur-md font-mono font-normal leading-normal placeholder:font-mono placeholder:font-normal placeholder:leading-normal placeholder:text-sm text-white placeholder:text-neutral-400 resize-none custom-scrollbar"
        placeholder="Write your code here..."
      />
    </div>
  );
}
