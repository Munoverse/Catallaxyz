/**
 * Market Category Selector Component
 * 
 * New market category system (Improvement #2)
 * 10 fixed categories
 */

'use client';

import { useState } from 'react';

// New category system (Improvement #2)
export const MARKET_CATEGORIES = [
  {
    id: 'wealth',
    name: 'Wealth',
    nameZh: 'Wealth',
    icon: '💰',
    description: 'Financial success and prosperity',
  },
  {
    id: 'physical_health',
    name: 'Physical Health',
    nameZh: 'Physical Health',
    icon: '💪',
    description: 'Body wellness and fitness',
  },
  {
    id: 'mental_health',
    name: 'Mental Health',
    nameZh: 'Mental Health',
    icon: '🧠',
    description: 'Mental wellness and emotional balance',
  },
  {
    id: 'family_friends',
    name: 'Family & Friends',
    nameZh: 'Family & Friends',
    icon: '👨‍👩‍👧‍👦',
    description: 'Relationships with family and friends',
  },
  {
    id: 'happiness',
    name: 'Happiness',
    nameZh: 'Happiness',
    icon: '😊',
    description: 'Joy and life satisfaction',
  },
  {
    id: 'self_growth',
    name: 'Self Growth',
    nameZh: 'Self Growth',
    icon: '🌱',
    description: 'Personal development and learning',
  },
  {
    id: 'career_achievement',
    name: 'Career & Achievement',
    nameZh: 'Career & Achievement',
    icon: '🎯',
    description: 'Professional success and academic excellence',
  },
  {
    id: 'relationships',
    name: 'Relationships',
    nameZh: 'Relationships',
    icon: '💕',
    description: 'Romantic and intimate connections',
  },
  {
    id: 'luck',
    name: 'Luck',
    nameZh: 'Luck',
    icon: '🍀',
    description: 'Fortune and serendipity',
  },
  {
    id: 'macro_vision',
    name: 'Macro Vision',
    nameZh: 'Macro Vision',
    icon: '🌍',
    description: 'Big picture goals and world events',
  },
] as const;

export type MarketCategoryId = typeof MARKET_CATEGORIES[number]['id'];

interface MarketCategorySelectorProps {
  value: MarketCategoryId | string | null;
  onChange: (category: MarketCategoryId) => void;
  showDescription?: boolean;
  layout?: 'grid' | 'dropdown';
  language?: 'en' | 'zh';
}

export default function MarketCategorySelector({
  value,
  onChange,
  showDescription = false,
  layout = 'grid',
  language = 'en',
}: MarketCategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedCategory = MARKET_CATEGORIES.find(cat => cat.id === value);

  // Dropdown Layout
  if (layout === 'dropdown') {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-4 py-2 bg-white border border-gray-300 rounded-lg hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <span className="flex items-center gap-2">
            {selectedCategory ? (
              <>
                <span className="text-xl">{selectedCategory.icon}</span>
                <span className="font-medium">
                  {language === 'zh' ? selectedCategory.nameZh : selectedCategory.name}
                </span>
              </>
            ) : (
              <span className="text-gray-500">Select a category...</span>
            )}
          </span>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
              {MARKET_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    onChange(category.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                    value === category.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="text-2xl">{category.icon}</span>
                  <div className="flex-1">
                    <div className={`font-medium ${value === category.id ? 'text-blue-700' : 'text-gray-900'}`}>
                      {language === 'zh' ? category.nameZh : category.name}
                    </div>
                    {showDescription && (
                      <div className="text-xs text-gray-500 mt-1">{category.description}</div>
                    )}
                  </div>
                  {value === category.id && (
                    <svg className="w-5 h-5 text-blue-600 mt-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Grid Layout
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {MARKET_CATEGORIES.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onChange(category.id)}
          className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
            value === category.id
              ? 'border-blue-500 bg-blue-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
          }`}
        >
          <span className="text-4xl">{category.icon}</span>
          <div className="text-center">
            <div className={`text-sm font-semibold ${
              value === category.id ? 'text-blue-700' : 'text-gray-900'
            }`}>
              {language === 'zh' ? category.nameZh : category.name}
            </div>
            {showDescription && (
              <div className="text-xs text-gray-500 mt-1">{category.description}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// Helper function to get category display info
export function getCategoryInfo(categoryId: string | null) {
  if (!categoryId) return null;
  return MARKET_CATEGORIES.find(cat => cat.id === categoryId);
}

// Category badge component
interface CategoryBadgeProps {
  categoryId: string | null;
  language?: 'en' | 'zh';
  size?: 'sm' | 'md' | 'lg';
}

export function CategoryBadge({ categoryId, language = 'en', size = 'md' }: CategoryBadgeProps) {
  const category = getCategoryInfo(categoryId);
  
  if (!category) return null;

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 bg-gray-100 text-gray-800 rounded-full font-medium ${sizeClasses[size]}`}>
      <span>{category.icon}</span>
      <span>{language === 'zh' ? category.nameZh : category.name}</span>
    </span>
  );
}
