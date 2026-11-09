import { createApp } from './app';

const PORT = process.env.PORT || 4000;
const { app } = createApp(process.env.GITHUB_WEBHOOK_SECRET || 'dev-secret');

app.listen(PORT, () => {
  console.log(`🚀 GitPulse Backend API running on port ${PORT}`);
});

