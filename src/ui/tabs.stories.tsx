import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tab, TabList, TabPanel, Tabs } from './tabs';

const meta = {
  title: 'UI/Tabs',
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Underline: Story = {
  render: () => (
    <Tabs defaultValue="modifications">
      <TabList>
        <Tab value="modifications" count={5}>
          Modifications
        </Tab>
        <Tab value="filters" count={4}>
          Filters
        </Tab>
      </TabList>
      <TabPanel value="modifications" className="pt-2 text-xs text-zinc-500">
        Modification rows…
      </TabPanel>
      <TabPanel value="filters" className="pt-2 text-xs text-zinc-500">
        Filter rows…
      </TabPanel>
    </Tabs>
  ),
};

export const ZeroCounts: Story = {
  render: () => (
    <Tabs defaultValue="filters">
      <TabList>
        <Tab value="modifications" count={0}>
          Modifications
        </Tab>
        <Tab value="filters" count={0}>
          Filters
        </Tab>
      </TabList>
      <TabPanel value="modifications" className="pt-2 text-xs text-zinc-500">
        Empty modifications
      </TabPanel>
      <TabPanel value="filters" className="pt-2 text-xs text-zinc-500">
        Empty filters
      </TabPanel>
    </Tabs>
  ),
};
