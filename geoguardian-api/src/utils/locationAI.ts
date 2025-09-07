import { LocationReading } from '../types/location';
import { MovementAnalysisResult } from '../types/movementAnalysis';
import { Geofence } from '../types/geofence';
import { spawn } from 'child_process';

interface AIValidationResult {
 plausible: boolean;
 confidence: number;
 reasoning: string;
 suggestedLocation?: LocationReading;
 recommendedAction: 'accept' | 'reject' | 'request_new_reading' | 'apply_correction';
}

interface AIAnomalyExplanation {
 explanation: string;
 likelyCauses: string[];
 recommendations: string[];
 severity: 'low' | 'medium' | 'high';
}

interface AIGeofenceOptimization {
 recommendedRadius: number;
 bufferStrategy: 'conservative' | 'moderate' | 'aggressive';
 reasoning: string;
 confidence: number;
}

export class LocationAI {
 private static instance: LocationAI;
 private llamaPath: string;
 private modelName: string;

 private aiProviders = [
    { name: 'groq', available: !!process.env.GROQ_API_KEY },
    { name: 'together', available: !!process.env.TOGETHER_API_KEY },
    { name: 'openai', available: !!process.env.OPENAI_API_KEY }
  ];

 constructor() {
   this.llamaPath = 'ollama';
   this.modelName = 'llama3.1:8b';
 }

 static getInstance(): LocationAI {
   if (!LocationAI.instance) {
     LocationAI.instance = new LocationAI();
   }
   return LocationAI.instance;
 }

 async validateLocationPlausibility(params: {
   current: LocationReading;
   history: LocationReading[];
   fusionResult?: LocationReading;
   context?: string;
 }): Promise<AIValidationResult> {
   const { current, history, fusionResult, context } = params;
   
   if (history.length === 0) {
     return {
       plausible: true,
       confidence: 0.8,
       reasoning: 'No history available for comparison',
       recommendedAction: 'accept'
     };
   }

   const timeSpan = history.length > 0 ? (current.timestamp - history[history.length - 1].timestamp) / 1000 : 0;
   const lastLocation = history[history.length - 1];
   const distance = this.calculateDistance(current, lastLocation);
   const impliedSpeed = timeSpan > 0 ? (distance / timeSpan) * 3.6 : 0;

   const prompt = this.buildValidationPrompt({
     current,
     history: history.slice(-3),
     fusionResult,
     timeSpan,
     impliedSpeed,
     context
   });

   try {
     const aiResponse = await this.callGroq(prompt);
     return this.parseValidationResponse(aiResponse, current);
   } catch (error) {
     console.warn('AI validation failed, using fallback:', error);
     return this.fallbackValidation(current, history);
   }
 }

 async explainMovementAnomaly(anomaly: MovementAnalysisResult, history: LocationReading[]): Promise<AIAnomalyExplanation> {
   const prompt = `Movement Anomaly Analysis:

Anomaly Details:
- Type: ${anomaly.anomalyType || 'unknown'}
- Reason: ${anomaly.reason}
- Distance: ${anomaly.distance}m in ${anomaly.timeElapsed}s
- Speed: ${anomaly.impliedSpeed} km/h
- Confidence: ${anomaly.confidence}
- Platform: ${anomaly.platformAnalysis.detectedPlatform}

Recent Location History:
${history.slice(-3).map((loc, i) => 
 `${i + 1}: ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)} (±${loc.accuracy}m)`
).join('\n')}

Platform Issues: ${anomaly.platformAnalysis.platformSpecificIssues.join(', ') || 'None'}
Quality: ${anomaly.qualityFactors.signalQuality} signal quality

Provide a clear explanation for non-technical users about why this GPS reading was flagged as anomalous, what likely caused it, and what to do about it.

Respond with ONLY valid JSON in this exact format:

\`\`\`json
{
 "explanation": "user-friendly explanation of what happened",
 "likelyCauses": ["cause1", "cause2", "cause3"],
 "recommendations": ["action1", "action2"],
 "severity": "medium"
}
\`\`\``;

   try {
     const response = await this.callGroq(prompt);
     return this.parseAnomalyResponse(response);
   } catch (error) {
     return {
       explanation: `GPS reading appears unrealistic: ${anomaly.reason}`,
       likelyCauses: ['GPS signal interference', 'Device movement', 'Environmental factors'],
       recommendations: ['Wait for better signal', 'Move to open area'],
       severity: anomaly.confidence < 0.3 ? 'high' : 'medium'
     };
   }
 }

 async optimizeGeofence(geofence: Geofence, environment: string, issues?: string[]): Promise<AIGeofenceOptimization> {
   const prompt = `Geofence Optimization Analysis:

Current Configuration:
- Radius: ${geofence.radius}m
- Purpose: ${geofence.metadata?.type || 'general'}
- Priority: ${geofence.metadata?.priority || 'medium'}
- Location: ${geofence.center.latitude}, ${geofence.center.longitude}

Environment: ${environment}
Issues: ${issues?.join(', ') || 'None reported'}

Consider factors like:
- GPS accuracy in ${environment} environments
- Typical GPS error patterns
- Building density and multipath effects
- User movement patterns
- False positive/negative rates

Recommend optimal radius and buffer strategy for reliable geofence operation.

Respond with ONLY valid JSON in this exact format:

\`\`\`json
{
 "recommendedRadius": 75,
 "bufferStrategy": "moderate",
 "reasoning": "explanation of recommendations",
 "confidence": 0.8
}
\`\`\``;

   try {
     const response = await this.callGroq(prompt);
     return this.parseGeofenceResponse(response, geofence.radius);
   } catch (error) {
     return {
       recommendedRadius: geofence.radius * 1.2,
       bufferStrategy: 'moderate',
       reasoning: 'Using conservative fallback due to AI unavailability',
       confidence: 0.5
     };
   }
 }

 private buildValidationPrompt(params: any): string {
   return `Location Plausibility Analysis:

Current GPS Reading:
- Coordinates: ${params.current.latitude.toFixed(6)}, ${params.current.longitude.toFixed(6)}
- Accuracy: ±${params.current.accuracy}m
- Platform: ${params.current.platform || 'unknown'}
- Timestamp: ${new Date(params.current.timestamp).toISOString()}

Previous Locations (last 3):
${params.history.map((loc: LocationReading, i: number) => 
 `${i + 1}: ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)} (±${loc.accuracy}m, ${new Date(loc.timestamp).toISOString()})`
).join('\n')}

Movement Analysis:
- Time elapsed: ${params.timeSpan}s
- Implied speed: ${params.impliedSpeed.toFixed(1)} km/h
- Environment: ${params.context || 'unknown'}

${params.fusionResult ? `Fusion Result: ${params.fusionResult.latitude.toFixed(6)}, ${params.fusionResult.longitude.toFixed(6)} (±${params.fusionResult.accuracy}m)` : ''}

Analyze if this GPS reading is plausible given:
1. Physical movement constraints
2. GPS error patterns for ${params.current.platform || 'unknown'} devices
3. Environmental factors (${params.context || 'unknown'})
4. Previous location consistency

Respond with ONLY valid JSON in this exact format:

\`\`\`json
{
 "plausible": true,
 "confidence": 0.8,
 "reasoning": "brief explanation",
 "recommendedAction": "accept"
}
\`\`\``;
 }

 private async callGroq(prompt: string): Promise<string> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1000
      })
    });
    
    const data = await response.json();
    return data.choices[0].message.content;
  }

 private parseValidationResponse(response: string, current: LocationReading): AIValidationResult {
   try {
     let jsonStr = response.trim();
     
     const codeBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
     if (codeBlockMatch) {
       jsonStr = codeBlockMatch[1];
     } else {
       const jsonMatch = jsonStr.match(/\{[\s\S]*?\}/);
       if (jsonMatch) {
         jsonStr = jsonMatch[0];
       }
     }
     
     jsonStr = jsonStr
       .replace(/\n\s*"([^"]+)":/g, '"$1":')
       .replace(/:\s*\n\s*"/g, ': "')
       .replace(/",\s*\n\s*"/g, '", "')
       .replace(/\s+/g, ' ')
       .trim();
     
     console.log('Parsing validation JSON:', jsonStr);
     
     const parsed = JSON.parse(jsonStr);
     
     return {
       plausible: parsed.plausible === true,
       confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
       reasoning: parsed.reasoning || 'AI analysis completed',
       suggestedLocation: parsed.suggestedLocation ? {
         ...current,
         latitude: parsed.suggestedLocation.latitude,
         longitude: parsed.suggestedLocation.longitude,
         accuracy: parsed.suggestedLocation.accuracy || current.accuracy
       } : undefined,
       recommendedAction: ['accept', 'reject', 'request_new_reading', 'apply_correction'].includes(parsed.recommendedAction) 
         ? parsed.recommendedAction : 'accept'
     };
   } catch (error) {
     console.warn('Validation JSON parsing failed:', error, '\nOriginal response:', response);
     return this.fallbackValidation(current, []);
   }
 }

 private parseAnomalyResponse(response: string): AIAnomalyExplanation {
   try {
     let jsonStr = response.trim();
     
     const codeBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
     if (codeBlockMatch) {
       jsonStr = codeBlockMatch[1];
     } else {
       const jsonMatch = jsonStr.match(/\{[\s\S]*?\}/);
       if (jsonMatch) {
         jsonStr = jsonMatch[0];
       }
     }
     
     jsonStr = jsonStr.replace(/\s+/g, ' ').trim();
     console.log('Parsing anomaly JSON:', jsonStr);
     
     const parsed = JSON.parse(jsonStr);
     
     return {
       explanation: parsed.explanation || 'GPS anomaly detected',
       likelyCauses: Array.isArray(parsed.likelyCauses) ? parsed.likelyCauses : ['GPS interference'],
       recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : ['Wait for better signal'],
       severity: ['low', 'medium', 'high'].includes(parsed.severity) ? parsed.severity : 'medium'
     };
   } catch (error) {
     console.warn('Anomaly JSON parsing failed:', error, '\nOriginal response:', response);
     return {
       explanation: 'GPS reading appears unusual',
       likelyCauses: ['Signal interference'],
       recommendations: ['Try again in open area'],
       severity: 'medium'
     };
   }
 }

 private parseGeofenceResponse(response: string, currentRadius: number): AIGeofenceOptimization {
   try {
     let jsonStr = response.trim();
     
     const codeBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
     if (codeBlockMatch) {
       jsonStr = codeBlockMatch[1];
     } else {
       const jsonMatch = jsonStr.match(/\{[\s\S]*?\}/);
       if (jsonMatch) {
         jsonStr = jsonMatch[0];
       }
     }
     
     jsonStr = jsonStr.replace(/\s+/g, ' ').trim();
     console.log('Parsing geofence JSON:', jsonStr);
     
     const parsed = JSON.parse(jsonStr);
     
     return {
       recommendedRadius: Math.max(10, Math.min(10000, parsed.recommendedRadius || currentRadius * 1.2)),
       bufferStrategy: ['conservative', 'moderate', 'aggressive'].includes(parsed.bufferStrategy) 
         ? parsed.bufferStrategy : 'moderate',
       reasoning: parsed.reasoning || 'AI optimization applied',
       confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5))
     };
   } catch (error) {
     console.warn('Geofence JSON parsing failed:', error, '\nOriginal response:', response);
     return {
       recommendedRadius: currentRadius * 1.2,
       bufferStrategy: 'moderate',
       reasoning: `AI parsing failed, applied 20% increase. Original response contained: ${response.substring(0, 50)}...`,
       confidence: 0.3
     };
   }
 }

 private fallbackValidation(current: LocationReading, history: LocationReading[]): AIValidationResult {
   return {
     plausible: current.accuracy < 100,
     confidence: current.accuracy < 50 ? 0.7 : 0.4,
     reasoning: 'Fallback validation - AI unavailable',
     recommendedAction: current.accuracy < 50 ? 'accept' : 'request_new_reading'
   };
 }

 private calculateDistance(loc1: LocationReading, loc2: LocationReading): number {
   const R = 6371000;
   const dLat = (loc2.latitude - loc1.latitude) * Math.PI / 180;
   const dLon = (loc2.longitude - loc1.longitude) * Math.PI / 180;
   const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
             Math.cos(loc1.latitude * Math.PI / 180) * Math.cos(loc2.latitude * Math.PI / 180) *
             Math.sin(dLon/2) * Math.sin(dLon/2);
   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
   return R * c;
 }
}