/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

/** @typedef {import("./Module")} Module */
/** @typedef {import("./DependenciesBlock")} DependenciesBlock */

/** @typedef {false | true | string[]} UsedExports */

const addToSet = (a, b) => {
	for (const item of b) {
		if (!a.includes(item)) a.push(item);
	}
	return a;
};

const isSubset = (biggerSet, subset) => {
	if (biggerSet === true) return true;
	if (subset === true) return false;
	return subset.every(item => biggerSet.indexOf(item) >= 0);
};

const getUsedExportsOwners = (entryId, module, usedExports) => {
	return usedExports.reduce((usedExportsOwners, usedExport) => {
		const usedExportOwners = usedExportsOwners[usedExport];
		if (!usedExportOwners) {
			usedExportsOwners[usedExport] = [entryId];
		} else if (!usedExportOwners.includes(entryId)) {
			usedExportOwners.push(entryId);
		}
		return usedExportsOwners;
	}, module.usedExportsOwners || {});
};

const getObjectLength = (object) => {
	return JSON.stringify(object).length;
};

class FlagDependencyUsagePlugin {
	apply(compiler) {
		compiler.hooks.compilation.tap("FlagDependencyUsagePlugin", compilation => {
			compilation.hooks.optimizeDependencies.tap(
				"FlagDependencyUsagePlugin",
				modules => {
					const processModule = (module, usedExports, entryId) => {
						module.used = true;
						if (module.usedExports === true) return;
						if (usedExports === true) {
							module.usedExports = true;
						} else if (Array.isArray(usedExports)) {
							const old = module.usedExports ? module.usedExports.length : -1;
							const oldOwnersLength = module.usedExportsOwners
								? getObjectLength(module.usedExportsOwners)
								: -1;
							module.usedExports = addToSet(
								module.usedExports || [],
								usedExports
							);
							module.usedExportsOwners = getUsedExportsOwners(
								entryId,
								module,
								usedExports
							);
							if (
								module.usedExports.length === old &&
								oldOwnersLength === getObjectLength(module.usedExportsOwners)
							) {
								return;
							}
						} else if (Array.isArray(module.usedExports)) {
							return;
						} else {
							module.usedExports = false;
						}

						// for a module without side effects we stop tracking usage here when no export is used
						// This module won't be evaluated in this case
						if (module.factoryMeta.sideEffectFree) {
							if (module.usedExports === false) return;
							if (
								Array.isArray(module.usedExports) &&
								module.usedExports.length === 0
							)
								return;
						}

						queue.push([module, module, module.usedExports, entryId]);
					};

					const processDependenciesBlock = (
						module,
						depBlock,
						usedExports,
						entryId
					) => {
						for (const dep of depBlock.dependencies) {
							processDependency(module, dep, entryId);
						}
						for (const variable of depBlock.variables) {
							for (const dep of variable.dependencies) {
								processDependency(module, dep, entryId);
							}
						}
						for (const block of depBlock.blocks) {
							queue.push([module, block, usedExports, entryId]);
						}
					};

					const processDependency = (module, dep, entryId) => {
						const reference = compilation.getDependencyReference(module, dep);
						if (!reference) return;
						const referenceModule = reference.module;
						const importedNames = reference.importedNames;
						const oldUsed = referenceModule.used;
						// const oldUsedExports = referenceModule.usedExports;
						if (!oldUsed || importedNames) {
							processModule(referenceModule, importedNames, entryId);
						}
					};

					for (const module of modules) {
						module.used = false;
					}

					/** @type {[Module, DependenciesBlock, UsedExports, String][]} */
					const queue = [];
					for (const preparedEntrypoint of compilation._preparedEntrypoints) {
						if (preparedEntrypoint.module) {
							processModule(
								preparedEntrypoint.module,
								true,
								preparedEntrypoint.module.identifier()
							);
						}
					}

					while (queue.length) {
						const queueItem = queue.pop();
						processDependenciesBlock(
							queueItem[0],
							queueItem[1],
							queueItem[2],
							queueItem[3]
						);
					}
				}
			);
		});
	}
}
module.exports = FlagDependencyUsagePlugin;
