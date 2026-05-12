/**
 * Family Mode Verification Script
 * 
 * Run this in the browser console to verify family mode configuration
 * 
 * Usage:
 * 1. Open the app in browser
 * 2. Open browser console (F12 or Cmd+Option+I)
 * 3. Copy and paste this entire script
 * 4. Press Enter
 * 5. Review the output
 */

(async function verifyFamilyMode() {
  console.log('=== Family Mode Verification ===\n');

  // Check if running in browser
  if (typeof window === 'undefined') {
    console.error('❌ This script must be run in a browser console');
    return;
  }

  // Check localStorage for cached config
  console.log('📦 Checking Local Storage Cache:');
  const mode = localStorage.getItem('spenza_backup_mode');
  const sharedFileId = localStorage.getItem('spenza_shared_file_id');
  const ownerRole = localStorage.getItem('spenza_owner_role');
  const configFileId = localStorage.getItem('spenza_config_file_id');

  console.log('  Mode:', mode || '❌ Not set');
  console.log('  Shared File ID:', sharedFileId || '❌ Not set');
  console.log('  Owner Role:', ownerRole || '❌ Not set');
  console.log('  Config File ID:', configFileId || '❌ Not set');

  // Check if authenticated
  console.log('\n🔐 Checking Authentication:');
  const authState = localStorage.getItem('gapi_auth_state');
  const userEmail = localStorage.getItem('gapi_user_email');
  const scopeVersion = localStorage.getItem('gapi_scope_version');

  console.log('  Auth State:', authState === '1' ? '✅ Authenticated' : '❌ Not authenticated');
  console.log('  User Email:', userEmail || '❌ Not set');
  console.log('  Scope Version:', scopeVersion || '❌ Not set');

  if (scopeVersion !== '6') {
    console.warn('  ⚠️  Scope version is not 6. You need to sign out and sign in again!');
  }

  // Verify configuration
  console.log('\n✅ Configuration Status:');
  
  if (!mode) {
    console.error('  ❌ Mode not set - will redirect to mode selection');
  } else if (mode === 'family') {
    console.log('  ✅ Mode: Family');
    
    if (!sharedFileId) {
      console.error('  ❌ Shared File ID not set - will redirect to family setup');
    } else {
      console.log('  ✅ Shared File ID:', sharedFileId);
      
      // Try to construct Drive link
      const driveLink = `https://drive.google.com/file/d/${sharedFileId}/view`;
      console.log('  📁 Drive Link:', driveLink);
    }
    
    if (!ownerRole) {
      console.warn('  ⚠️  Owner Role not set');
    } else {
      console.log('  ✅ Owner Role:', ownerRole);
    }
  } else if (mode === 'single') {
    console.log('  ✅ Mode: Single User');
  }

  // Check if we can access the Angular app
  console.log('\n🔍 Checking App State:');
  try {
    // Try to access Angular's global state (if available)
    const ngDebug = window.ng;
    if (ngDebug) {
      console.log('  ✅ Angular debug tools available');
      console.log('  💡 You can inspect components using: ng.probe($0)');
    } else {
      console.log('  ℹ️  Angular debug tools not available (production mode)');
    }
  } catch (err) {
    console.log('  ℹ️  Cannot access Angular state');
  }

  // Summary
  console.log('\n📊 Summary:');
  const issues = [];
  
  if (!authState || authState !== '1') {
    issues.push('Not authenticated - sign in required');
  }
  
  if (scopeVersion !== '6') {
    issues.push('Old scope version - sign out and sign in again');
  }
  
  if (!mode) {
    issues.push('Mode not set - will redirect to mode selection');
  }
  
  if (mode === 'family' && !sharedFileId) {
    issues.push('Family mode but no shared file ID - will redirect to family setup');
  }
  
  if (issues.length === 0) {
    console.log('  ✅ All checks passed! Configuration looks good.');
  } else {
    console.log('  ⚠️  Issues found:');
    issues.forEach(issue => console.log(`     - ${issue}`));
  }

  console.log('\n=== End Verification ===');
})();
