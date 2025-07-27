import React, { useState, useEffect } from 'react';
import { Brain, Sparkles, Zap, Lightbulb, Code, Search, Wrench, FileText } from 'lucide-react';

const thinkingMessages = [
  { text: "Analyzing your request", icon: Search },
  { text: "Gathering context", icon: FileText },
  { text: "Formulating response", icon: Brain },
  { text: "Crafting solution", icon: Wrench },
  { text: "Optimizing approach", icon: Lightbulb },
  { text: "Writing code", icon: Code },
  { text: "Double-checking logic", icon: Zap },
  { text: "Preparing insights", icon: Sparkles },
];

export const ThinkingPlaceholder: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState('');

  // Cycle through messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % thinkingMessages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Animate dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const currentMessage = thinkingMessages[messageIndex];
  const Icon = currentMessage.icon;

  return (
    <div className="flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        {/* Main container with subtle glow effect */}
        <div className="relative">
          {/* Glow background */}
          <div className="absolute inset-0 bg-interactive/20 blur-3xl rounded-full animate-pulse" />
          
          {/* Content */}
          <div className="relative bg-surface-secondary/80 backdrop-blur-sm rounded-2xl p-8 border border-border-primary shadow-xl">
            {/* Animated icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                {/* Spinning ring */}
                <div className="absolute inset-0 border-4 border-interactive/30 rounded-full animate-spin" 
                     style={{ animationDuration: '3s' }} />
                <div className="absolute inset-0 border-4 border-transparent border-t-interactive rounded-full animate-spin"
                     style={{ animationDuration: '1.5s' }} />
                
                {/* Center icon */}
                <div className="relative w-20 h-20 bg-surface-tertiary rounded-full flex items-center justify-center">
                  <Icon className="w-10 h-10 text-interactive-on-dark animate-pulse" />
                </div>
              </div>
            </div>

            {/* Status text */}
            <div className="text-center space-y-2">
              <h3 className="text-lg font-medium text-text-primary">
                Claude is thinking{dots}
              </h3>
              <p className="text-sm text-text-secondary animate-fadeIn">
                {currentMessage.text}
              </p>
            </div>

            {/* Progress indicators */}
            <div className="flex justify-center mt-6 space-x-2">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-interactive/30"
                  style={{
                    animation: 'bounce 1.4s ease-in-out infinite',
                    animationDelay: `${i * 0.1}s`,
                    animationFillMode: 'both'
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Fun fact or tip */}
        <div className="mt-6 text-center">
          <p className="text-xs text-text-tertiary italic">
            💡 Tip: You can view Claude's thinking process by enabling "Show Thinking" in settings
          </p>
        </div>
      </div>
    </div>
  );
};

// Fun wacky status messages for inline indicator
export const wackyStatusMessages = [
  "Clauding intensely...",
  "Synthesizing brilliance...",
  "Cooking up something special...",
  "Turbo-thinking engaged...",
  "Neurons firing at max capacity...",
  "Quantum computing your request...",
  "Channeling the code gods...",
  "Brewing digital magic...",
  "Crunching the bits and bytes...",
  "Activating galaxy brain...",
  "Downloading wisdom from the cloud...",
  "Consulting the silicon oracle...",
  "Assembling genius particles...",
  "Warming up the AI engines...",
  "Flexing computational muscles...",
  "Summoning algorithmic spirits...",
  "Weaving code tapestries...",
  "Igniting synaptic fireworks...",
  "Transmuting ideas into reality...",
  "Unleashing digital wizardry...",
  "Orchestrating elegant solutions...",
  "Performing code alchemy...",
  "Surfing the datastream...",
  "Ascending to peak performance...",
  "Crafting artisanal algorithms...",
  "Deploying tactical thinking...",
  "Engaging hyperdrive...",
  "Computing at warp speed...",
  "Hacking the matrix...",
  "Compiling awesomeness...",
  "Refactoring reality...",
  "Debugging the universe...",
  "Optimizing everything...",
  "Bootstrapping brilliance...",
  "Parsing possibilities...",
  "Executing master plan...",
  "Loading next-level insights...",
  "Calibrating code lasers...",
  "Activating beast mode...",
  "Unlocking achievement...",
];

// Inline working indicator component
export const InlineWorkingIndicator: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [nextChangeTime, setNextChangeTime] = useState(3000);

  useEffect(() => {
    // Start with a random message
    setMessageIndex(Math.floor(Math.random() * wackyStatusMessages.length));
  }, []);

  useEffect(() => {
    // Change message with variable timing (jitter)
    const timeout = setTimeout(() => {
      setMessageIndex((prev) => (prev + 1) % wackyStatusMessages.length);
      // Random interval between 2.5 and 6 seconds (more jitter)
      setNextChangeTime(2500 + Math.random() * 3500);
    }, nextChangeTime);
    
    return () => clearTimeout(timeout);
  }, [messageIndex, nextChangeTime]);

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface-secondary/50 rounded-lg border border-border-primary animate-fadeIn">
      <div className="flex space-x-1">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="w-2 h-2 bg-interactive rounded-full"
            style={{
              animation: 'bounce 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.16}s`
            }}
          />
        ))}
      </div>
      <span className="text-sm text-text-secondary font-medium">
        {wackyStatusMessages[messageIndex]}
      </span>
    </div>
  );
};