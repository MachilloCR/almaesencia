export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ProductAvailabilityStatus =
  | "in_stock"
  | "on_order"
  | "out_of_stock"
  | "inactive";

export type OrderStatus = "pending_review" | "confirmed" | "cancelled" | "completed";
export type ProcurementStatus = "not_required" | "pending_supplier" | "ordered" | "received";
export type FulfillmentStatus = "pending" | "ready" | "delivered";
export type PaymentStatus = "pending" | "partial" | "paid";
export type PaymentMethod = "cash" | "sinpe_movil" | "bank_transfer" | "other";

export type Database = {
  public: {
    Tables: {
      categories: Table<
        {
          created_at: string;
          description: string | null;
          id: string;
          image_path: string | null;
          is_active: boolean;
          name: string;
          slug: string;
          updated_at: string;
        },
        {
          description?: string | null;
          image_path?: string | null;
          is_active?: boolean;
          name: string;
          slug: string;
        }
      >;
      inventory: Table<
        {
          product_id: string;
          quantity: number;
          updated_at: string;
          updated_by: string | null;
        },
        {
          product_id: string;
          quantity?: number;
          updated_by?: string | null;
        }
      >;
      order_items: Table<
        {
          availability_snapshot: ProductAvailabilityStatus;
          created_at: string;
          id: string;
          options_snapshot: Json;
          order_id: string;
          product_id: string | null;
          product_name_snapshot: string;
          product_slug_snapshot: string | null;
          quantity: number;
          unit_price_snapshot: number;
        },
        {
          availability_snapshot: ProductAvailabilityStatus;
          order_id: string;
          product_id?: string | null;
          product_name_snapshot: string;
          product_slug_snapshot?: string | null;
          quantity: number;
          unit_price_snapshot: number;
          options_snapshot?: Json;
        }
      >;
      order_payments: Table<
        {
          amount: number;
          created_at: string;
          id: string;
          note: string | null;
          order_id: string;
          payment_method: PaymentMethod;
          received_at: string;
          recorded_by: string | null;
        },
        {
          amount: number;
          order_id: string;
          payment_method: PaymentMethod;
          note?: string | null;
          received_at?: string;
          recorded_by?: string | null;
        }
      >;
      order_status_history: Table<
        {
          changed_by: string | null;
          created_at: string;
          id: string;
          next_value: string;
          note: string | null;
          order_id: string;
          previous_value: string | null;
          status_type: string;
        },
        {
          next_value: string;
          order_id: string;
          status_type: string;
          note?: string | null;
          previous_value?: string | null;
        }
      >;
      orders: Table<
        {
          admin_notes: string | null;
          completed_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          confirmed_total: number | null;
          currency: string;
          customer_name: string;
          customer_phone: string;
          delivered_at: string | null;
          delivery_notes: string | null;
          estimated_total: number;
          fulfillment_status: FulfillmentStatus;
          id: string;
          order_number: string;
          order_status: OrderStatus;
          paid_at: string | null;
          payment_method: PaymentMethod | null;
          payment_notes: string | null;
          payment_status: PaymentStatus;
          procurement_status: ProcurementStatus;
          requested_at: string;
          updated_at: string;
        },
        {
          customer_name: string;
          customer_phone: string;
          order_number: string;
          confirmed_total?: number | null;
          delivery_notes?: string | null;
        }
      >;
      product_images: Table<
        {
          alt_text: string;
          created_at: string;
          id: string;
          product_id: string;
          sort_order: number;
          storage_path: string;
        },
        {
          alt_text: string;
          product_id: string;
          storage_path: string;
          sort_order?: number;
        }
      >;
      product_categories: Table<
        {
          category_id: string;
          created_at: string;
          product_id: string;
        },
        {
          category_id: string;
          product_id: string;
        }
      >;
      products: Table<
        {
          availability_status: ProductAvailabilityStatus;
          category_id: string;
          created_at: string;
          currency: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          price: number;
          slug: string;
          updated_at: string;
        },
        {
          category_id: string;
          name: string;
          price: number;
          slug: string;
          availability_status?: ProductAvailabilityStatus;
          currency?: string;
          description?: string | null;
          is_active?: boolean;
        }
      >;
      profiles: Table<
        {
          created_at: string;
          id: string;
          role: string;
        },
        {
          id: string;
          role?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_order_request: {
        Args: {
          p_customer_name: string;
          p_customer_phone: string;
          p_delivery_notes: string;
          p_items: Json;
        };
        Returns: { order_id: string; order_number: string }[];
      };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      can_view_product_category: { Args: { p_category_id: string; p_product_id: string }; Returns: boolean };
      save_admin_product: {
        Args: {
          p_product_id: string | null;
          p_category_ids: string[];
          p_name: string;
          p_slug: string;
          p_description: string | null;
          p_price: number;
          p_availability_status: ProductAvailabilityStatus;
          p_is_active: boolean;
        };
        Returns: Database["public"]["Tables"]["products"]["Row"][];
      };
      record_order_payment: {
        Args: {
          p_order_id: string;
          p_amount: number;
          p_payment_method: PaymentMethod;
          p_note?: string | null;
        };
        Returns: {
          payment_id: string;
          amount: number;
          payment_method: PaymentMethod;
          note: string | null;
          received_at: string;
          total_paid: number;
          payment_status: PaymentStatus;
        }[];
      };
      set_order_confirmed_total: {
        Args: { p_order_id: string; p_confirmed_total: number };
        Returns: {
          confirmed_total: number;
          total_paid: number;
          payment_status: PaymentStatus;
        }[];
      };
    };
    Enums: {
      fulfillment_status: FulfillmentStatus;
      order_status: OrderStatus;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      procurement_status: ProcurementStatus;
      product_availability_status: ProductAvailabilityStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
