import { ThemeControls } from "../../components/theme-controls";
import { ShellThemeProvider } from "../../components/shell-theme-provider";

export default function ThemePage() {
  return <ShellThemeProvider><ThemeControls /></ShellThemeProvider>;
}
