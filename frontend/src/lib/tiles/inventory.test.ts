import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import InventoryGridTile from './InventoryGridTile.svelte';
import LowStockAlertTile from './LowStockAlertTile.svelte';
import ShoppingListTile from './ShoppingListTile.svelte';
import RecipeSuggestTile from './RecipeSuggestTile.svelte';
import ExpiryTile from './ExpiryTile.svelte';
import BudgetTile from './BudgetTile.svelte';

describe('inventory bundle', () => {
  it('InventoryGrid renders', () => {
    const { getByTestId } = render(InventoryGridTile, { props: { id: 'inv' } });
    expect(getByTestId('inventory')).toBeInTheDocument();
  });

  it('LowStockAlert renders', () => {
    const { getByTestId } = render(LowStockAlertTile, { props: { id: 'ls' } });
    expect(getByTestId('low-stock')).toBeInTheDocument();
  });

  it('ShoppingList toggles item state and updates count', async () => {
    const { getAllByTestId, getByTestId } = render(ShoppingListTile, {
      props: {
        id: 'sl',
        props: {
          demo: [
            { id: '1', name: 'Milk' },
            { id: '2', name: 'Eggs' },
            { id: '3', name: 'Bread' }
          ]
        }
      }
    });
    const shop = getByTestId('shopping');
    expect(shop.textContent).toContain('3 left');
    const items = getAllByTestId('shop-item');
    await fireEvent.click(items[0]);
    expect(shop.textContent).toContain('2 left');
  });

  it('RecipeSuggest renders sorted list', () => {
    const { getByTestId } = render(RecipeSuggestTile, { props: { id: 'rs' } });
    expect(getByTestId('recipes')).toBeInTheDocument();
  });

  it('Expiry renders', () => {
    const { getByTestId } = render(ExpiryTile, { props: { id: 'ex' } });
    expect(getByTestId('expiry')).toBeInTheDocument();
  });

  it('Budget renders with pace indicator', () => {
    const { getByTestId } = render(BudgetTile, {
      props: { id: 'bg', props: { monthlyBudget: 500, spent: 250 } }
    });
    expect(getByTestId('budget')).toBeInTheDocument();
  });
});
