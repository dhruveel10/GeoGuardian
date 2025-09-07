const API_BASE = 'http://localhost:5001';

const testData = {
 goodLocation: {
   latitude: 40.7128,
   longitude: -74.0060,
   accuracy: 10,
   timestamp: Date.now(),
   platform: 'ios'
 },
 
 poorLocation: {
   latitude: 40.7128,
   longitude: -74.0060,
   accuracy: 150,
   timestamp: Date.now(),
   platform: 'web'
 },

 locationHistory: [
   {
     latitude: 40.7120,
     longitude: -74.0050,
     accuracy: 25,
     timestamp: Date.now() - 90000,
     platform: 'web'
   },
   {
     latitude: 40.7123,
     longitude: -74.0053,
     accuracy: 30,
     timestamp: Date.now() - 60000,
     platform: 'web'
   },
   {
     latitude: 40.7125,
     longitude: -74.0055,
     accuracy: 20,
     timestamp: Date.now() - 30000,
     platform: 'web'
   }
 ],

 previousLocation: {
   latitude: 40.7125,
   longitude: -74.0055,
   accuracy: 15,
   timestamp: Date.now() - 30000,
   platform: 'ios'
 },

 jumpLocation: {
   latitude: 40.8000,
   longitude: -73.9000,
   accuracy: 20,
   timestamp: Date.now(),
   platform: 'ios'
 },

 geofence: {
   id: 'test-office',
   name: 'Test Office Building',
   center: { latitude: 40.7130, longitude: -74.0062 },
   radius: 50,
   metadata: {
     type: 'building',
     priority: 'high'
   }
 }
};

async function runTests() {
 console.log('🧪 Testing AI-Enhanced GeoGuardian API\n');

 // Test 1: Basic location fusion with AI
 console.log('📍 Test 1: AI-Enhanced Location Fusion');
 try {
   const response = await fetch(`${API_BASE}/api/v1/fusion/fused`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       currentLocation: testData.poorLocation,
       locationHistory: testData.locationHistory,
       fusionOptions: {
         enableWeightedAveraging: true,
         enableKalmanFilter: true,
         aggressiveness: 'moderate'
       },
       requestId: 'test-fusion-1'
     })
   });
   
   const result = await response.json();
   console.log('Response:', JSON.stringify(result, null, 2));
   console.log('AI Applied Corrections:', result.data?.fusion?.appliedCorrections || []);
   console.log('Accuracy Improvement:', result.data?.comparison?.accuracyImprovement || 0);
   console.log('Distance Shift:', result.data?.comparison?.distanceShift || 0);
 } catch (error) {
   console.error('❌ Fusion test failed:', error.message);
 }

 console.log('\n' + '='.repeat(50) + '\n');

 // Test 1.5: Test with good location and history for comparison
 console.log('📍 Test 1.5: Fusion with Good Location Data');
 try {
   const goodHistory = testData.locationHistory.map(loc => ({
     ...loc,
     accuracy: 12,
     platform: 'ios'
   }));

   const response = await fetch(`${API_BASE}/api/v1/fusion/fused`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       currentLocation: {
         ...testData.goodLocation,
         latitude: 40.7127,
         longitude: -74.0058,
         accuracy: 15
       },
       locationHistory: goodHistory,
       fusionOptions: {
         enableWeightedAveraging: true,
         enableKalmanFilter: true,
         aggressiveness: 'moderate'
       },
       requestId: 'test-fusion-1.5'
     })
   });
   
   const result = await response.json();
   console.log('Good Location Fusion Result:');
   console.log('Original Accuracy:', result.data?.original?.location?.accuracy);
   console.log('Fused Accuracy:', result.data?.fused?.location?.accuracy);
   console.log('Applied Corrections:', result.data?.fusion?.appliedCorrections || []);
   console.log('Accuracy Improvement:', result.data?.comparison?.accuracyImprovement || 0);
 } catch (error) {
   console.error('❌ Good fusion test failed:', error.message);
 }

 console.log('\n' + '='.repeat(50) + '\n');

 // Test 6: Fusion comparison test
 console.log('⚖️ Test 6: Fusion Comparison');
 try {
   const response = await fetch(`${API_BASE}/api/v1/fusion/compare`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       currentLocation: testData.poorLocation,
       locationHistory: testData.locationHistory,
       fusionOptions: {
         enableWeightedAveraging: true,
         enableKalmanFilter: true,
         aggressiveness: 'aggressive'
       },
       requestId: 'test-compare-1'
     })
   });
   
   const result = await response.json();
   console.log('Comparison Results:');
   console.log('Raw Quality Score:', result.data?.raw?.quality?.score);
   console.log('Fused Quality Score:', result.data?.fused?.quality?.score);
   console.log('Quality Score Gain:', result.data?.improvements?.qualityScoreGain);
   console.log('Accuracy Gain:', result.data?.improvements?.accuracyGain);
   console.log('Platform Optimizations:', result.data?.visualComparison?.platformOptimizations || []);
 } catch (error) {
   console.error('❌ Comparison test failed:', error.message);
 }
}

// Helper function to run with Node.js
if (typeof fetch === 'undefined') {
 global.fetch = require('node-fetch');
}

runTests().then(() => {
 console.log('\n✅ All tests completed');
}).catch(console.error);