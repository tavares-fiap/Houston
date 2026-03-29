"use client";

import { useState } from "react";

interface InputPanelProps {
  onSubmit: (message: string) => void;
  isProcessing: boolean;
}

const EXAMPLES = [
  {
    label: '🐛 "The save button doesn\'t work on the profile page..."',
    message:
      "Hi, the save button on the profile page isn't working. I click it and nothing happens. I've tried on Chrome and Firefox. It was working fine yesterday before the update.",
  },
  {
    label: '❓ "What\'s the refund policy for annual plans?"',
    message:
      "Hello, I'd like to know what the refund policy is for annual plans. Can I get a prorated refund if I cancel mid-year?",
  },
  {
    label: '✨ "It would be useful to have dark mode on the dashboard..."',
    message:
      "Hey, it would be really useful to have a dark mode option on the dashboard. I work at night a lot and the bright screen is hard on my eyes.",
  },
];

export default function InputPanel({ onSubmit, isProcessing }: InputPanelProps) {
  const [message, setMessage] = useState("");

  function handleSubmit() {
    if (message.trim() && !isProcessing) {
      onSubmit(message.trim());
    }
  }

  function handleExample(text: string) {
    setMessage(text);
  }

  return (
    <div className="flex flex-col h-full p-5">
      <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
        Client Message
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type a client message to simulate..."
        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 resize-none focus:outline-none focus:border-zinc-500 min-h-[120px]"
        disabled={isProcessing}
      />

      <button
        onClick={handleSubmit}
        disabled={!message.trim() || isProcessing}
        className="mt-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg py-3 text-sm font-semibold transition-colors"
      >
        {isProcessing ? "Processing..." : "Send to Houston →"}
      </button>

      <div className="mt-4">
        <div className="text-xs text-zinc-500 mb-2">Quick examples:</div>
        <div className="flex flex-col gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => handleExample(ex.message)}
              disabled={isProcessing}
              className="text-left bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-50"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
