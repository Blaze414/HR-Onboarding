// Metro must follow symlinks out of the app folder to reach packages/shared,
// which ships TypeScript source rather than a build artefact.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// expo-router is hoisted to the workspace root, so its automatic detection of
// the routes directory does not fire. Metro's transform workers inherit this
// process's environment, so setting it here reaches them all.
process.env.EXPO_ROUTER_APP_ROOT = path.resolve(projectRoot, 'app');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Hierarchical lookup stays on: npm hoists some Expo packages to the workspace
// root and leaves others in the app, and both have to resolve each other.

module.exports = config;
