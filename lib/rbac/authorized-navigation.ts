import type {
  NavigationSection,
  PermissionCode,
  SecurityClassification,
} from './types';

type NavigationAccessContext = {
  permissions: ReadonlySet<PermissionCode>;
  compartments: ReadonlySet<SecurityClassification>;
};

type NavigationAuthorizationChecks = {
  hasPermission: (permission: PermissionCode) => Promise<boolean>;
  hasCompartment: (classification: SecurityClassification) => Promise<boolean>;
};

const UNRESTRICTED_CLASSIFICATIONS = new Set<SecurityClassification>([
  'PUBLIC',
  'INTERNAL',
]);

export function filterNavigationForAccess(
  navigation: readonly NavigationSection[],
  context: NavigationAccessContext,
): NavigationSection[] {
  return navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const permissionAllowed = item.permissions.every((permission) =>
          context.permissions.has(permission),
        );
        if (!permissionAllowed) return false;

        if (
          !item.classification ||
          UNRESTRICTED_CLASSIFICATIONS.has(item.classification)
        ) {
          return true;
        }

        return context.compartments.has(item.classification);
      }),
    }))
    .filter((section) => section.items.length > 0);
}

async function safeCheck<T>(check: (value: T) => Promise<boolean>, value: T) {
  try {
    return await check(value);
  } catch {
    return false;
  }
}

export async function resolveAuthorizedNavigation(
  navigation: readonly NavigationSection[],
  checks: NavigationAuthorizationChecks,
): Promise<NavigationSection[]> {
  const permissionCodes = Array.from(
    new Set(navigation.flatMap((section) => section.items.flatMap((item) => item.permissions))),
  );
  const protectedClassifications = Array.from(
    new Set(
      navigation
        .flatMap((section) => section.items.map((item) => item.classification))
        .filter((classification): classification is SecurityClassification => {
          if (!classification) return false;
          return !UNRESTRICTED_CLASSIFICATIONS.has(classification);
        }),
    ),
  );

  const [permissionResults, compartmentResults] = await Promise.all([
    Promise.all(
      permissionCodes.map(async (permission) => [
        permission,
        await safeCheck(checks.hasPermission, permission),
      ] as const),
    ),
    Promise.all(
      protectedClassifications.map(async (classification) => [
        classification,
        await safeCheck(checks.hasCompartment, classification),
      ] as const),
    ),
  ]);

  return filterNavigationForAccess(navigation, {
    permissions: new Set(
      permissionResults
        .filter(([, allowed]) => allowed)
        .map(([permission]) => permission),
    ),
    compartments: new Set(
      compartmentResults
        .filter(([, allowed]) => allowed)
        .map(([classification]) => classification),
    ),
  });
}
