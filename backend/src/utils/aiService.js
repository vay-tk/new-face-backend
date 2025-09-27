import axios from 'axios';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

export const callAIService = async (endpoint, data) => {
  try {
    console.log(`Calling AI service endpoint: ${endpoint}`);
    const response = await axios.post(`${AI_SERVICE_URL}${endpoint}`, data, {
      timeout: 60000, // Increase timeout to 60 seconds
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`AI service response for ${endpoint}:`, response.data);
    return response.data;
  } catch (error) {
    console.error('AI Service error:', error.response?.data || error.message);
    
    // Return mock data for development when AI service is not available
    if (process.env.NODE_ENV === 'development') {
      console.log('Using mock AI response for development');
      return getMockAIResponse(endpoint, data);
    }
    
    throw new Error(`AI Service unavailable: ${error.response?.data?.detail || error.message}`);
  }
};

// Mock AI responses for development
const getMockAIResponse = (endpoint, data) => {
  console.log('Using mock AI response for:', endpoint);
  
  switch (endpoint) {
    case '/enroll':
      return {
        success: true,
        embedding: Array.from({ length: 128 }, () => Math.random()),
        imageId: data.imageId
      };
      
    case '/match-with-liveness':
      return {
        success: true,
        livenessResult: {
          isLive: true,
          score: 0.85,
          blinkDetected: true,
          headMovementDetected: true,
          details: {
            blinkScore: 0.9,
            headMovementScore: 0.8
          }
        },
        matchResult: {
          isMatch: true,
          confidence: 0.92,
          bestMatchIndex: 0
        }
      };
      
    default:
      return {
        success: false,
        error: 'Unknown endpoint'
      };
  }
};