import { publicEnv } from '@/app/config/env';

// Keep creation closed until the Renderer HTML/PDF workers and reader are part
// of the same reviewed release candidate.
export const typstCreationEnabled = publicEnv.typstCreateEnabled;
