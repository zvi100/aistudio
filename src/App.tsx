import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { MapPin, Send, User, Bot, Loader2, ExternalLink, Map as MapIcon, Globe, Navigation } from 'lucide-react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingChunks?: any[];
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hello! I am your MapChat assistant. I can help you find places, get directions, and explore the area around you. Where would you like to go today?',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.error('Error getting location:', error);
          setLocationError('Could not get your location. Using default location (San Francisco).');
          setLocation({ latitude: 37.7749, longitude: -122.4194 }); // Default to SF
        }
      );
    } else {
      setLocationError('Geolocation is not supported by your browser.');
      setLocation({ latitude: 37.7749, longitude: -122.4194 }); // Default to SF
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // We must use gemini-2.5-flash for googleMaps tool support
      const model = 'gemini-2.5-flash';

      // Prepare chat history for generateContent
      const contents = messages
        .filter((m) => m.id !== 'welcome') // Skip welcome message to save tokens if needed, or keep it. Let's keep it.
        .map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));
      
      contents.push({
        role: 'user',
        parts: [{ text: userMessage.text }],
      });

      const config: any = {
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
      };

      if (location) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
          },
        };
      }

      const response = await ai.models.generateContent({
        model,
        contents,
        config,
      });

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || 'I could not find an answer to that.',
        groundingChunks,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Error generating response:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: 'Sorry, I encountered an error while processing your request. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderGroundingChunks = (chunks: any[]) => {
    if (!chunks || chunks.length === 0) return null;

    const mapChunks = chunks.filter((c) => c.maps);
    const webChunks = chunks.filter((c) => c.web);

    return (
      <div className="mt-4 space-y-4">
        {mapChunks.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <MapIcon className="w-4 h-4 text-blue-500" />
              Places Found
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mapChunks.map((chunk, idx) => (
                <a
                  key={`map-${idx}`}
                  href={chunk.maps.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h5 className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                        {chunk.maps.title || 'View on Google Maps'}
                      </h5>
                      {chunk.maps.placeAnswerSources?.reviewSnippets?.[0] && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2 italic">
                          "{chunk.maps.placeAnswerSources.reviewSnippets[0]}"
                        </p>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-blue-500 flex-shrink-0 ml-2 mt-0.5" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {webChunks.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-emerald-500" />
              Web Sources
            </h4>
            <div className="flex flex-wrap gap-2">
              {webChunks.map((chunk, idx) => (
                <a
                  key={`web-${idx}`}
                  href={chunk.web.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full text-xs font-medium text-gray-700 transition-colors"
                >
                  <span className="truncate max-w-[200px]">{chunk.web.title || chunk.web.uri}</span>
                  <ExternalLink className="w-3 h-3 text-gray-400" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm z-10 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-inner">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">MapChat</h1>
              <p className="text-xs text-gray-500 font-medium">Powered by Google Maps & Gemini</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {location ? (
              <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                <Navigation className="w-4 h-4" />
                <span className="font-medium">Location Active</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="font-medium">Locating...</span>
              </div>
            )}
          </div>
        </div>
        {locationError && (
          <div className="max-w-4xl mx-auto mt-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100">
            {locationError}
          </div>
        )}
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex w-full',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'flex max-w-[85%] sm:max-w-[75%] gap-3 sm:gap-4',
                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm',
                    message.role === 'user'
                      ? 'bg-gray-900 text-white'
                      : 'bg-blue-100 text-blue-600 border border-blue-200'
                  )}
                >
                  {message.role === 'user' ? (
                    <User className="w-5 h-5" />
                  ) : (
                    <Bot className="w-5 h-5" />
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={cn(
                    'flex flex-col gap-2',
                    message.role === 'user' ? 'items-end' : 'items-start'
                  )}
                >
                  <div
                    className={cn(
                      'px-4 py-3 sm:px-5 sm:py-4 rounded-2xl shadow-sm',
                      message.role === 'user'
                        ? 'bg-gray-900 text-white rounded-tr-sm'
                        : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'
                    )}
                  >
                    <div
                      className={cn(
                        'prose prose-sm sm:prose-base max-w-none',
                        message.role === 'user' ? 'prose-invert' : 'prose-gray'
                      )}
                    >
                      <Markdown>{message.text}</Markdown>
                    </div>
                  </div>

                  {/* Grounding Chunks (Maps & Web Links) */}
                  {message.groundingChunks && message.groundingChunks.length > 0 && (
                    <div className="w-full max-w-full">
                      {renderGroundingChunks(message.groundingChunks)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex max-w-[85%] sm:max-w-[75%] gap-3 sm:gap-4 flex-row">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm bg-blue-100 text-blue-600 border border-blue-200">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="px-5 py-4 rounded-2xl shadow-sm bg-white border border-gray-100 text-gray-800 rounded-tl-sm flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  <span className="text-sm font-medium text-gray-500">Searching maps & web...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="bg-white border-t border-gray-200 p-4 sm:p-6 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 sm:gap-3 bg-gray-50 border border-gray-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all shadow-sm"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Ask about places nearby, directions, or local recommendations..."
              className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none focus:ring-0 resize-none py-2.5 px-3 text-gray-900 placeholder-gray-400 text-sm sm:text-base"
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors flex-shrink-0 shadow-sm"
            >
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          </form>
          <p className="text-center text-xs text-gray-400 mt-3 font-medium">
            MapChat uses Gemini to search Google Maps and the web.
          </p>
        </div>
      </footer>
    </div>
  );
}

