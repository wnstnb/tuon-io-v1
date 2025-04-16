'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

const ThemeShowcase = () => {
  const { theme, toggleTheme } = useTheme();
  const [sliderValue, setSliderValue] = useState(50);
  const [mounted, setMounted] = useState(false);

  // For dynamic progress styling of the range input
  useEffect(() => {
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const min = parseInt(target.min) || 0;
      const max = parseInt(target.max) || 100;
      const val = parseInt(target.value);
      const percentage = ((val - min) * 100) / (max - min);
      target.style.setProperty('--range-progress', `${percentage}%`);
    };

    rangeInputs.forEach(input => {
      input.addEventListener('input', handleInput);
      // Set initial value
      handleInput({ target: input } as unknown as Event);
    });

    setMounted(true);

    return () => {
      rangeInputs.forEach(input => {
        input.removeEventListener('input', handleInput);
      });
    };
  }, []);

  if (!mounted) return null;

  return (
    <div className="w-full max-w-5xl mx-auto p-8">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold">Theme Showcase</h1>
        <button onClick={toggleTheme} className="theme-toggle">
          {theme === 'light' ? (
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          ) : (
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Left Side - Light mode equivalent */}
        <div className="bg-[#F6F8FA] p-8 rounded-lg shadow-md dark:bg-[#2B3137]">
          <h2 className="text-2xl font-semibold mb-6 text-[#0F1317] dark:text-white">Controls</h2>
          
          {/* Sliders Section */}
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-4 text-[#0F1317] dark:text-white">Sliders</h3>
            <div className="space-y-6">
              <div>
                <label className="block mb-2 text-sm font-medium text-[#3F4F60] dark:text-white">Volume</label>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={sliderValue} 
                  onChange={(e) => setSliderValue(parseInt(e.target.value))} 
                  className="w-full" 
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-[#3F4F60] dark:text-white">Brightness</label>
                <input type="range" min="0" max="100" defaultValue="75" className="w-full" />
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-[#3F4F60] dark:text-white">Contrast</label>
                <input type="range" min="0" max="100" defaultValue="60" className="w-full" />
              </div>
            </div>
          </div>

          {/* Home Button */}
          <div className="mb-8">
            <div className="w-16 h-16 rounded-xl bg-[#D9DDE2] dark:bg-[#0F1317] shadow-md flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E5B679" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dark:text-primary">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </div>
          </div>
        </div>

        {/* Right Side - Dark mode equivalent */}
        <div className="bg-[#0F1317] p-8 rounded-lg shadow-lg text-white">
          <h2 className="text-2xl font-semibold mb-6 text-white">User Profile</h2>
          
          {/* Profile Section */}
          <div className="mb-8 flex items-center space-x-4">
            <div className="profile-avatar">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#C79553" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-medium text-white">Name Surname</h3>
              <p className="text-sm text-[#A8ADB4]">Lorem ipsum dolor</p>
            </div>
          </div>

          {/* Search Section */}
          <div className="mb-8">
            <div className="search-bar mb-4">
              <span className="search-bar-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C79553" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input type="text" placeholder="Search" className="bg-[#2B3137] text-white placeholder-[#3F4F60] border border-[#3F4F60]" />
            </div>
          </div>

          {/* Video Section */}
          <div className="mb-8">
            <div className="video-player">
              <div className="aspect-w-16 aspect-h-9 bg-[#2B3137] rounded-t-lg flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F1C37D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </div>
              <div className="video-controls bg-[#2B3137] p-2 rounded-b-lg flex items-center space-x-2">
                <button className="play-button text-[#C79553]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </button>
                <div className="w-full">
                  <input type="range" min="0" max="100" defaultValue="30" className="w-full" />
                </div>
              </div>
            </div>
          </div>

          {/* Calendar */}
          <div className="mb-8">
            <div className="calendar bg-[#2B3137] p-4 rounded-lg">
              <div className="calendar-header flex justify-between items-center mb-4">
                <button className="text-[#C79553]">&lt;</button>
                <h3 className="text-white">August 2023</h3>
                <button className="text-[#C79553]">&gt;</button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                <span className="text-center text-xs text-[#A8ADB4]">S</span>
                <span className="text-center text-xs text-[#A8ADB4]">M</span>
                <span className="text-center text-xs text-[#A8ADB4]">T</span>
                <span className="text-center text-xs text-[#A8ADB4]">W</span>
                <span className="text-center text-xs text-[#A8ADB4]">T</span>
                <span className="text-center text-xs text-[#A8ADB4]">F</span>
                <span className="text-center text-xs text-[#A8ADB4]">S</span>
              </div>
              <div className="calendar-grid grid grid-cols-7 gap-1">
                {[...Array(31)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`calendar-day text-center p-1 text-sm rounded ${i === 16 ? 'bg-[#C79553] text-white' : 'hover:bg-[#3F4F60]'}`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeShowcase; 