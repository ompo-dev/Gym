import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

export const AGENTS = [
  { id: 'claude', label: 'Claude', image: require('../../../assets/images/agents/claude.png') },
  { id: 'chatgpt', label: 'ChatGPT', image: require('../../../assets/images/agents/chatgpt.png') },
  { id: 'claudecode', label: 'Claude Code', image: require('../../../assets/images/agents/claudecode.png') },
  { id: 'codex', label: 'Codex', image: require('../../../assets/images/agents/codex.png') },
  { id: 'gemini', label: 'Gemini', image: require('../../../assets/images/agents/gemini.png') },
  { id: 'mcp', label: 'MCP', image: require('../../../assets/images/agents/mcp.png') },
] as const;
export type AgentId = typeof AGENTS[number]['id'];

export function AgentLogo({ agent, size = 38 }: { agent: AgentId; size?: number }) {
  const item = AGENTS.find((item) => item.id === agent)!;
  return <View style={[styles.logo, { width: size, height: size, borderRadius: size / 2 }]}>
    <Image source={item.image} contentFit="contain" accessibilityLabel={item.label}
      style={{ width: size * 0.68, height: size * 0.68 }} />
  </View>;
}

export function AgentLogos() {
  return <View style={styles.strip}>{AGENTS.slice(0, 5).map((agent, index) =>
    <View key={agent.id} style={{ marginLeft: index ? -7 : 0 }}><AgentLogo agent={agent.id} /></View>)}</View>;
}

const styles = StyleSheet.create({
  logo: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', paddingVertical: 4 },
});
