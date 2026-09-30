export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          accent_color: string;
          theme: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accent_color?: string;
          theme?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accent_color?: string;
          theme?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      deployment_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [];
      };
      tesoro_assortments: {
        Row: {
          brand: string;
          created_at: string;
          id: string;
          name: string;
          retired: boolean;
          sort: number;
        };
        Insert: {
          brand?: string;
          created_at?: string;
          id?: string;
          name: string;
          retired?: boolean;
          sort?: number;
        };
        Update: {
          brand?: string;
          created_at?: string;
          id?: string;
          name?: string;
          retired?: boolean;
          sort?: number;
        };
        Relationships: [];
      };
      tesoro_brand_logos: {
        Row: {
          brand: string;
          image_url: string;
          label: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          brand: string;
          image_url: string;
          label?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          brand?: string;
          image_url?: string;
          label?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      tesoro_car_catalog: {
        Row: {
          assortment: string;
          brand: string;
          car_id: string;
          car_number: string;
          colour: string;
          colours: string[];
          created_at: string;
          created_by: string | null;
          expected_date: string | null;
          image_source_url: string | null;
          image_url: string | null;
          is_multipack: boolean;
          make: string;
          model: string;
          mrp: number;
          name: string;
          pack_size: number | null;
          rarity: string;
          release_status: string;
          released_at: string | null;
          series: string;
          size: string;
          standalone: boolean;
          sub_series: string;
          type: string;
          updated_at: string;
          updated_by: string | null;
          variant: string;
          year: string | null;
        };
        Insert: {
          assortment?: string;
          brand?: string;
          car_id: string;
          car_number?: string;
          colour?: string;
          colours?: string[];
          created_at?: string;
          created_by?: string | null;
          expected_date?: string | null;
          image_source_url?: string | null;
          image_url?: string | null;
          is_multipack?: boolean;
          make?: string;
          model?: string;
          mrp?: number;
          name?: string;
          pack_size?: number | null;
          rarity?: string;
          release_status?: string;
          released_at?: string | null;
          series?: string;
          size?: string;
          standalone?: boolean;
          sub_series?: string;
          type?: string;
          updated_at?: string;
          updated_by?: string | null;
          variant?: string;
          year?: string | null;
        };
        Update: {
          assortment?: string;
          brand?: string;
          car_id?: string;
          car_number?: string;
          colour?: string;
          colours?: string[];
          created_at?: string;
          created_by?: string | null;
          expected_date?: string | null;
          image_source_url?: string | null;
          image_url?: string | null;
          is_multipack?: boolean;
          make?: string;
          model?: string;
          mrp?: number;
          name?: string;
          pack_size?: number | null;
          rarity?: string;
          release_status?: string;
          released_at?: string | null;
          series?: string;
          size?: string;
          standalone?: boolean;
          sub_series?: string;
          type?: string;
          updated_at?: string;
          updated_by?: string | null;
          variant?: string;
          year?: string | null;
        };
        Relationships: [];
      };
      tesoro_car_catalog_backup_20260918: {
        Row: {
          assortment: string | null;
          brand: string | null;
          car_id: string | null;
          car_number: string | null;
          colour: string | null;
          created_at: string | null;
          created_by: string | null;
          expected_date: string | null;
          image_url: string | null;
          make: string | null;
          model: string | null;
          mrp: number | null;
          name: string | null;
          rarity: string | null;
          release_status: string | null;
          series: string | null;
          size: string | null;
          sub_series: string | null;
          type: string | null;
          updated_at: string | null;
          variant: string | null;
          year: string | null;
        };
        Insert: {
          assortment?: string | null;
          brand?: string | null;
          car_id?: string | null;
          car_number?: string | null;
          colour?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          expected_date?: string | null;
          image_url?: string | null;
          make?: string | null;
          model?: string | null;
          mrp?: number | null;
          name?: string | null;
          rarity?: string | null;
          release_status?: string | null;
          series?: string | null;
          size?: string | null;
          sub_series?: string | null;
          type?: string | null;
          updated_at?: string | null;
          variant?: string | null;
          year?: string | null;
        };
        Update: {
          assortment?: string | null;
          brand?: string | null;
          car_id?: string | null;
          car_number?: string | null;
          colour?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          expected_date?: string | null;
          image_url?: string | null;
          make?: string | null;
          model?: string | null;
          mrp?: number | null;
          name?: string | null;
          rarity?: string | null;
          release_status?: string | null;
          series?: string | null;
          size?: string | null;
          sub_series?: string | null;
          type?: string | null;
          updated_at?: string | null;
          variant?: string | null;
          year?: string | null;
        };
        Relationships: [];
      };
      tesoro_car_id_map: {
        Row: {
          migrated_at: string;
          new_id: string;
          old_id: string;
        };
        Insert: {
          migrated_at?: string;
          new_id: string;
          old_id: string;
        };
        Update: {
          migrated_at?: string;
          new_id?: string;
          old_id?: string;
        };
        Relationships: [];
      };
      tesoro_catalog_codes: {
        Row: {
          code: number;
          created_at: string;
          kind: string;
          parent_key: string;
          value_key: string;
        };
        Insert: {
          code: number;
          created_at?: string;
          kind: string;
          parent_key?: string;
          value_key: string;
        };
        Update: {
          code?: number;
          created_at?: string;
          kind?: string;
          parent_key?: string;
          value_key?: string;
        };
        Relationships: [];
      };
      tesoro_catalog_dupe_backup_20260925: {
        Row: {
          assortment: string | null;
          brand: string | null;
          car_id: string | null;
          car_number: string | null;
          colour: string | null;
          created_at: string | null;
          created_by: string | null;
          expected_date: string | null;
          image_url: string | null;
          is_multipack: boolean | null;
          make: string | null;
          model: string | null;
          mrp: number | null;
          name: string | null;
          pack_size: number | null;
          rarity: string | null;
          release_status: string | null;
          released_at: string | null;
          series: string | null;
          size: string | null;
          sub_series: string | null;
          type: string | null;
          updated_at: string | null;
          updated_by: string | null;
          variant: string | null;
          year: string | null;
        };
        Insert: {
          assortment?: string | null;
          brand?: string | null;
          car_id?: string | null;
          car_number?: string | null;
          colour?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          expected_date?: string | null;
          image_url?: string | null;
          is_multipack?: boolean | null;
          make?: string | null;
          model?: string | null;
          mrp?: number | null;
          name?: string | null;
          pack_size?: number | null;
          rarity?: string | null;
          release_status?: string | null;
          released_at?: string | null;
          series?: string | null;
          size?: string | null;
          sub_series?: string | null;
          type?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          variant?: string | null;
          year?: string | null;
        };
        Update: {
          assortment?: string | null;
          brand?: string | null;
          car_id?: string | null;
          car_number?: string | null;
          colour?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          expected_date?: string | null;
          image_url?: string | null;
          is_multipack?: boolean | null;
          make?: string | null;
          model?: string | null;
          mrp?: number | null;
          name?: string | null;
          pack_size?: number | null;
          rarity?: string | null;
          release_status?: string | null;
          released_at?: string | null;
          series?: string | null;
          size?: string | null;
          sub_series?: string | null;
          type?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          variant?: string | null;
          year?: string | null;
        };
        Relationships: [];
      };
      tesoro_catalog_image_snapshot_20260924: {
        Row: {
          brand: string | null;
          captured_at: string | null;
          car_id: string | null;
          image_url: string | null;
          make: string | null;
          model: string | null;
          series: string | null;
          variant: string | null;
        };
        Insert: {
          brand?: string | null;
          captured_at?: string | null;
          car_id?: string | null;
          image_url?: string | null;
          make?: string | null;
          model?: string | null;
          series?: string | null;
          variant?: string | null;
        };
        Update: {
          brand?: string | null;
          captured_at?: string | null;
          car_id?: string | null;
          image_url?: string | null;
          make?: string | null;
          model?: string | null;
          series?: string | null;
          variant?: string | null;
        };
        Relationships: [];
      };
      tesoro_catalog_mix_backup_20260929: {
        Row: {
          assortment: string | null;
          brand: string | null;
          car_id: string | null;
          car_number: string | null;
          colour: string | null;
          make: string | null;
          model: string | null;
          series: string | null;
          sub_series: string | null;
          variant: string | null;
          year: string | null;
        };
        Insert: {
          assortment?: string | null;
          brand?: string | null;
          car_id?: string | null;
          car_number?: string | null;
          colour?: string | null;
          make?: string | null;
          model?: string | null;
          series?: string | null;
          sub_series?: string | null;
          variant?: string | null;
          year?: string | null;
        };
        Update: {
          assortment?: string | null;
          brand?: string | null;
          car_id?: string | null;
          car_number?: string | null;
          colour?: string | null;
          make?: string | null;
          model?: string | null;
          series?: string | null;
          sub_series?: string | null;
          variant?: string | null;
          year?: string | null;
        };
        Relationships: [];
      };
      tesoro_catalog_pack_members: {
        Row: {
          created_at: string;
          member_car_id: string;
          pack_car_id: string;
          position: number;
        };
        Insert: {
          created_at?: string;
          member_car_id: string;
          pack_car_id: string;
          position?: number;
        };
        Update: {
          created_at?: string;
          member_car_id?: string;
          pack_car_id?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tesoro_catalog_pack_members_member_car_id_fkey";
            columns: ["member_car_id"];
            isOneToOne: false;
            referencedRelation: "tesoro_car_catalog";
            referencedColumns: ["car_id"];
          },
          {
            foreignKeyName: "tesoro_catalog_pack_members_pack_car_id_fkey";
            columns: ["pack_car_id"];
            isOneToOne: false;
            referencedRelation: "tesoro_car_catalog";
            referencedColumns: ["car_id"];
          },
        ];
      };
      tesoro_dead_photo_backup_20260924: {
        Row: {
          captured_at: string;
          image_url: string | null;
          key: string;
          source: string;
        };
        Insert: {
          captured_at?: string;
          image_url?: string | null;
          key: string;
          source: string;
        };
        Update: {
          captured_at?: string;
          image_url?: string | null;
          key?: string;
          source?: string;
        };
        Relationships: [];
      };
      tesoro_id_backup_20260927: {
        Row: {
          "Car ID": string | null;
          old_order_id: string | null;
          old_shipping_id: string | null;
          SNO: number | null;
          user_id: string | null;
        };
        Insert: {
          "Car ID"?: string | null;
          old_order_id?: string | null;
          old_shipping_id?: string | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Update: {
          "Car ID"?: string | null;
          old_order_id?: string | null;
          old_shipping_id?: string | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      tesoro_push_subscriptions: {
        Row: {
          auth: string;
          auth_uid: string;
          created_at: string;
          endpoint: string;
          id: number;
          p256dh: string;
          user_agent: string | null;
        };
        Insert: {
          auth: string;
          auth_uid: string;
          created_at?: string;
          endpoint: string;
          id?: never;
          p256dh: string;
          user_agent?: string | null;
        };
        Update: {
          auth?: string;
          auth_uid?: string;
          created_at?: string;
          endpoint?: string;
          id?: never;
          p256dh?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      tesoro_raw: {
        Row: {
          admin_changed_at: string | null;
          admin_changed_by: string | null;
          Assortment: string;
          Balance: string | null;
          "Box ID": string | null;
          Brand: string;
          "Car Condition": string | null;
          "Car ID": string;
          "Car Number": string | null;
          "Car Rating": number | null;
          "Card Condition": string | null;
          "Card Rating": number | null;
          "Case Number": string | null;
          "Catalog ID": string;
          catalog_pending_at: string | null;
          Chase: boolean | null;
          Colour: string | null;
          Condition: string | null;
          created_at: string | null;
          Currency: string | null;
          Date: string | null;
          "Delivery Partner": string | null;
          "Expected Date": string | null;
          Favourite: boolean | null;
          "Image URL": string | null;
          Kuttu: boolean | null;
          Make: string;
          Model: string;
          Month: string | null;
          MRP: number;
          Name: string;
          O_Date: string | null;
          O_Month: string | null;
          Official: boolean | null;
          "Order ID": string | null;
          "Order Info": string | null;
          owner_seen_at: string | null;
          Paid: string | null;
          Payment: string | null;
          Rarity: string | null;
          Rate: string | null;
          Seller: string;
          Series: string | null;
          "Shipping Cost": string | null;
          "Shipping ID": string | null;
          Size: string;
          SNO: number;
          Spent: string;
          Status: string;
          "Sub Series": string | null;
          "Tracking ID": string | null;
          "Transit Info / ETA": string | null;
          Type: string;
          user_id: string | null;
          Variant: string | null;
          Year: number | null;
        };
        Insert: {
          admin_changed_at?: string | null;
          admin_changed_by?: string | null;
          Assortment: string;
          Balance?: string | null;
          "Box ID"?: string | null;
          Brand: string;
          "Car Condition"?: string | null;
          "Car ID": string;
          "Car Number"?: string | null;
          "Car Rating"?: number | null;
          "Card Condition"?: string | null;
          "Card Rating"?: number | null;
          "Case Number"?: string | null;
          "Catalog ID": string;
          catalog_pending_at?: string | null;
          Chase?: boolean | null;
          Colour?: string | null;
          Condition?: string | null;
          created_at?: string | null;
          Currency?: string | null;
          Date?: string | null;
          "Delivery Partner"?: string | null;
          "Expected Date"?: string | null;
          Favourite?: boolean | null;
          "Image URL"?: string | null;
          Kuttu?: boolean | null;
          Make: string;
          Model: string;
          Month?: string | null;
          MRP: number;
          Name: string;
          O_Date?: string | null;
          O_Month?: string | null;
          Official?: boolean | null;
          "Order ID"?: string | null;
          "Order Info"?: string | null;
          owner_seen_at?: string | null;
          Paid?: string | null;
          Payment?: string | null;
          Rarity?: string | null;
          Rate?: string | null;
          Seller: string;
          Series?: string | null;
          "Shipping Cost"?: string | null;
          "Shipping ID"?: string | null;
          Size: string;
          SNO?: number;
          Spent: string;
          Status: string;
          "Sub Series"?: string | null;
          "Tracking ID"?: string | null;
          "Transit Info / ETA"?: string | null;
          Type: string;
          user_id?: string | null;
          Variant?: string | null;
          Year?: number | null;
        };
        Update: {
          admin_changed_at?: string | null;
          admin_changed_by?: string | null;
          Assortment?: string;
          Balance?: string | null;
          "Box ID"?: string | null;
          Brand?: string;
          "Car Condition"?: string | null;
          "Car ID"?: string;
          "Car Number"?: string | null;
          "Car Rating"?: number | null;
          "Card Condition"?: string | null;
          "Card Rating"?: number | null;
          "Case Number"?: string | null;
          "Catalog ID"?: string;
          catalog_pending_at?: string | null;
          Chase?: boolean | null;
          Colour?: string | null;
          Condition?: string | null;
          created_at?: string | null;
          Currency?: string | null;
          Date?: string | null;
          "Delivery Partner"?: string | null;
          "Expected Date"?: string | null;
          Favourite?: boolean | null;
          "Image URL"?: string | null;
          Kuttu?: boolean | null;
          Make?: string;
          Model?: string;
          Month?: string | null;
          MRP?: number;
          Name?: string;
          O_Date?: string | null;
          O_Month?: string | null;
          Official?: boolean | null;
          "Order ID"?: string | null;
          "Order Info"?: string | null;
          owner_seen_at?: string | null;
          Paid?: string | null;
          Payment?: string | null;
          Rarity?: string | null;
          Rate?: string | null;
          Seller?: string;
          Series?: string | null;
          "Shipping Cost"?: string | null;
          "Shipping ID"?: string | null;
          Size?: string;
          SNO?: number;
          Spent?: string;
          Status?: string;
          "Sub Series"?: string | null;
          "Tracking ID"?: string | null;
          "Transit Info / ETA"?: string | null;
          Type?: string;
          user_id?: string | null;
          Variant?: string | null;
          Year?: number | null;
        };
        Relationships: [];
      };
      tesoro_raw_backup_20260918: {
        Row: {
          Assortment: string | null;
          Balance: string | null;
          "Box ID": string | null;
          Brand: string | null;
          "Car Condition": string | null;
          "Car ID": string | null;
          "Car Number": string | null;
          "Car Rating": number | null;
          "Card Condition": string | null;
          "Card Rating": number | null;
          Chase: boolean | null;
          Colour: string | null;
          Condition: string | null;
          Currency: string | null;
          Date: string | null;
          "Delivery Partner": string | null;
          "Expected Date": string | null;
          Favourite: boolean | null;
          "Image URL": string | null;
          Kuttu: boolean | null;
          Make: string | null;
          Model: string | null;
          Month: string | null;
          MRP: number | null;
          Name: string | null;
          O_Date: string | null;
          O_Month: string | null;
          Official: boolean | null;
          "Order ID": string | null;
          "Order Info": string | null;
          Paid: string | null;
          Payment: string | null;
          Rarity: string | null;
          Rate: string | null;
          Seller: string | null;
          Series: string | null;
          "Shipping Cost": string | null;
          "Shipping ID": string | null;
          Size: string | null;
          SNO: number | null;
          Spent: string | null;
          Status: string | null;
          "Sub Series": string | null;
          "Tracking ID": string | null;
          "Transit Info / ETA": string | null;
          Type: string | null;
          user_id: string | null;
          Variant: string | null;
          Year: number | null;
        };
        Insert: {
          Assortment?: string | null;
          Balance?: string | null;
          "Box ID"?: string | null;
          Brand?: string | null;
          "Car Condition"?: string | null;
          "Car ID"?: string | null;
          "Car Number"?: string | null;
          "Car Rating"?: number | null;
          "Card Condition"?: string | null;
          "Card Rating"?: number | null;
          Chase?: boolean | null;
          Colour?: string | null;
          Condition?: string | null;
          Currency?: string | null;
          Date?: string | null;
          "Delivery Partner"?: string | null;
          "Expected Date"?: string | null;
          Favourite?: boolean | null;
          "Image URL"?: string | null;
          Kuttu?: boolean | null;
          Make?: string | null;
          Model?: string | null;
          Month?: string | null;
          MRP?: number | null;
          Name?: string | null;
          O_Date?: string | null;
          O_Month?: string | null;
          Official?: boolean | null;
          "Order ID"?: string | null;
          "Order Info"?: string | null;
          Paid?: string | null;
          Payment?: string | null;
          Rarity?: string | null;
          Rate?: string | null;
          Seller?: string | null;
          Series?: string | null;
          "Shipping Cost"?: string | null;
          "Shipping ID"?: string | null;
          Size?: string | null;
          SNO?: number | null;
          Spent?: string | null;
          Status?: string | null;
          "Sub Series"?: string | null;
          "Tracking ID"?: string | null;
          "Transit Info / ETA"?: string | null;
          Type?: string | null;
          user_id?: string | null;
          Variant?: string | null;
          Year?: number | null;
        };
        Update: {
          Assortment?: string | null;
          Balance?: string | null;
          "Box ID"?: string | null;
          Brand?: string | null;
          "Car Condition"?: string | null;
          "Car ID"?: string | null;
          "Car Number"?: string | null;
          "Car Rating"?: number | null;
          "Card Condition"?: string | null;
          "Card Rating"?: number | null;
          Chase?: boolean | null;
          Colour?: string | null;
          Condition?: string | null;
          Currency?: string | null;
          Date?: string | null;
          "Delivery Partner"?: string | null;
          "Expected Date"?: string | null;
          Favourite?: boolean | null;
          "Image URL"?: string | null;
          Kuttu?: boolean | null;
          Make?: string | null;
          Model?: string | null;
          Month?: string | null;
          MRP?: number | null;
          Name?: string | null;
          O_Date?: string | null;
          O_Month?: string | null;
          Official?: boolean | null;
          "Order ID"?: string | null;
          "Order Info"?: string | null;
          Paid?: string | null;
          Payment?: string | null;
          Rarity?: string | null;
          Rate?: string | null;
          Seller?: string | null;
          Series?: string | null;
          "Shipping Cost"?: string | null;
          "Shipping ID"?: string | null;
          Size?: string | null;
          SNO?: number | null;
          Spent?: string | null;
          Status?: string | null;
          "Sub Series"?: string | null;
          "Tracking ID"?: string | null;
          "Transit Info / ETA"?: string | null;
          Type?: string | null;
          user_id?: string | null;
          Variant?: string | null;
          Year?: number | null;
        };
        Relationships: [];
      };
      tesoro_raw_car_id_backup_20260927: {
        Row: {
          old_car_id: string | null;
          SNO: number | null;
          user_id: string | null;
        };
        Insert: {
          old_car_id?: string | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Update: {
          old_car_id?: string | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      tesoro_raw_car_id_backup_20260927b: {
        Row: {
          old_car_id: string | null;
          SNO: number | null;
          user_id: string | null;
        };
        Insert: {
          old_car_id?: string | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Update: {
          old_car_id?: string | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      tesoro_raw_car_id_map: {
        Row: {
          migrated_at: string;
          new_id: string;
          old_id: string;
          user_id: string;
        };
        Insert: {
          migrated_at?: string;
          new_id: string;
          old_id: string;
          user_id: string;
        };
        Update: {
          migrated_at?: string;
          new_id?: string;
          old_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      tesoro_raw_codes: {
        Row: {
          code: string;
          created_at: string;
          kind: string;
          value_key: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          kind: string;
          value_key: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          kind?: string;
          value_key?: string;
        };
        Relationships: [];
      };
      tesoro_raw_id_plan: {
        Row: {
          acode: string | null;
          bcode: string | null;
          current_id: string | null;
          id_prefix: string | null;
          new_id: string | null;
          num: number | null;
          old_car_id: string | null;
          onum: number | null;
          SNO: number | null;
          user_id: string | null;
        };
        Insert: {
          acode?: string | null;
          bcode?: string | null;
          current_id?: string | null;
          id_prefix?: string | null;
          new_id?: string | null;
          num?: number | null;
          old_car_id?: string | null;
          onum?: number | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Update: {
          acode?: string | null;
          bcode?: string | null;
          current_id?: string | null;
          id_prefix?: string | null;
          new_id?: string | null;
          num?: number | null;
          old_car_id?: string | null;
          onum?: number | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      tesoro_raw_image_snapshot_20260924: {
        Row: {
          captured_at: string | null;
          "Catalog ID": string | null;
          "Image URL": string | null;
          Make: string | null;
          Model: string | null;
          SNO: number | null;
          user_id: string | null;
        };
        Insert: {
          captured_at?: string | null;
          "Catalog ID"?: string | null;
          "Image URL"?: string | null;
          Make?: string | null;
          Model?: string | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Update: {
          captured_at?: string | null;
          "Catalog ID"?: string | null;
          "Image URL"?: string | null;
          Make?: string | null;
          Model?: string | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      tesoro_raw_image_snapshot_20260924b: {
        Row: {
          captured_at: string | null;
          "Catalog ID": string | null;
          "Image URL": string | null;
          Make: string | null;
          Model: string | null;
          SNO: number | null;
          user_id: string | null;
        };
        Insert: {
          captured_at?: string | null;
          "Catalog ID"?: string | null;
          "Image URL"?: string | null;
          Make?: string | null;
          Model?: string | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Update: {
          captured_at?: string | null;
          "Catalog ID"?: string | null;
          "Image URL"?: string | null;
          Make?: string | null;
          Model?: string | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      tesoro_raw_mix_backup_20260929: {
        Row: {
          "Car ID": string | null;
          "Case Number": string | null;
          "Catalog ID": string | null;
          SNO: number | null;
          "Sub Series": string | null;
        };
        Insert: {
          "Car ID"?: string | null;
          "Case Number"?: string | null;
          "Catalog ID"?: string | null;
          SNO?: number | null;
          "Sub Series"?: string | null;
        };
        Update: {
          "Car ID"?: string | null;
          "Case Number"?: string | null;
          "Catalog ID"?: string | null;
          SNO?: number | null;
          "Sub Series"?: string | null;
        };
        Relationships: [];
      };
      tesoro_raw_open_backup_20260915: {
        Row: {
          "Car ID": string | null;
          Open: boolean | null;
          SNO: number | null;
          user_id: string | null;
        };
        Insert: {
          "Car ID"?: string | null;
          Open?: boolean | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Update: {
          "Car ID"?: string | null;
          Open?: boolean | null;
          SNO?: number | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      tesoro_sellers: {
        Row: {
          image_url: string | null;
          location: string | null;
          owner_name: string;
          phone: string | null;
          prefer: string;
          seller_key: string;
          store_name: string | null;
          updated_at: string;
          updated_by: string | null;
          whatsapp: string | null;
        };
        Insert: {
          image_url?: string | null;
          location?: string | null;
          owner_name?: string;
          phone?: string | null;
          prefer?: string;
          seller_key: string;
          store_name?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          whatsapp?: string | null;
        };
        Update: {
          image_url?: string | null;
          location?: string | null;
          owner_name?: string;
          phone?: string | null;
          prefer?: string;
          seller_key?: string;
          store_name?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          whatsapp?: string | null;
        };
        Relationships: [];
      };
      tesoro_setu_backup_20260927_catalog: {
        Row: {
          assortment: string | null;
          brand: string | null;
          car_id: string | null;
          car_number: string | null;
          colour: string | null;
          created_at: string | null;
          created_by: string | null;
          expected_date: string | null;
          image_url: string | null;
          is_multipack: boolean | null;
          make: string | null;
          model: string | null;
          mrp: number | null;
          name: string | null;
          pack_size: number | null;
          rarity: string | null;
          release_status: string | null;
          released_at: string | null;
          series: string | null;
          size: string | null;
          sub_series: string | null;
          type: string | null;
          updated_at: string | null;
          updated_by: string | null;
          variant: string | null;
          year: string | null;
        };
        Insert: {
          assortment?: string | null;
          brand?: string | null;
          car_id?: string | null;
          car_number?: string | null;
          colour?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          expected_date?: string | null;
          image_url?: string | null;
          is_multipack?: boolean | null;
          make?: string | null;
          model?: string | null;
          mrp?: number | null;
          name?: string | null;
          pack_size?: number | null;
          rarity?: string | null;
          release_status?: string | null;
          released_at?: string | null;
          series?: string | null;
          size?: string | null;
          sub_series?: string | null;
          type?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          variant?: string | null;
          year?: string | null;
        };
        Update: {
          assortment?: string | null;
          brand?: string | null;
          car_id?: string | null;
          car_number?: string | null;
          colour?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          expected_date?: string | null;
          image_url?: string | null;
          is_multipack?: boolean | null;
          make?: string | null;
          model?: string | null;
          mrp?: number | null;
          name?: string | null;
          pack_size?: number | null;
          rarity?: string | null;
          release_status?: string | null;
          released_at?: string | null;
          series?: string | null;
          size?: string | null;
          sub_series?: string | null;
          type?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          variant?: string | null;
          year?: string | null;
        };
        Relationships: [];
      };
      tesoro_setu_backup_20260927_catalog_all: {
        Row: {
          assortment: string | null;
          brand: string | null;
          car_id: string | null;
          car_number: string | null;
          colour: string | null;
          created_at: string | null;
          created_by: string | null;
          expected_date: string | null;
          image_url: string | null;
          is_multipack: boolean | null;
          make: string | null;
          model: string | null;
          mrp: number | null;
          name: string | null;
          pack_size: number | null;
          rarity: string | null;
          release_status: string | null;
          released_at: string | null;
          series: string | null;
          size: string | null;
          sub_series: string | null;
          type: string | null;
          updated_at: string | null;
          updated_by: string | null;
          variant: string | null;
          year: string | null;
        };
        Insert: {
          assortment?: string | null;
          brand?: string | null;
          car_id?: string | null;
          car_number?: string | null;
          colour?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          expected_date?: string | null;
          image_url?: string | null;
          is_multipack?: boolean | null;
          make?: string | null;
          model?: string | null;
          mrp?: number | null;
          name?: string | null;
          pack_size?: number | null;
          rarity?: string | null;
          release_status?: string | null;
          released_at?: string | null;
          series?: string | null;
          size?: string | null;
          sub_series?: string | null;
          type?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          variant?: string | null;
          year?: string | null;
        };
        Update: {
          assortment?: string | null;
          brand?: string | null;
          car_id?: string | null;
          car_number?: string | null;
          colour?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          expected_date?: string | null;
          image_url?: string | null;
          is_multipack?: boolean | null;
          make?: string | null;
          model?: string | null;
          mrp?: number | null;
          name?: string | null;
          pack_size?: number | null;
          rarity?: string | null;
          release_status?: string | null;
          released_at?: string | null;
          series?: string | null;
          size?: string | null;
          sub_series?: string | null;
          type?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          variant?: string | null;
          year?: string | null;
        };
        Relationships: [];
      };
      tesoro_setu_backup_20260927_raw: {
        Row: {
          Assortment: string | null;
          Balance: string | null;
          "Box ID": string | null;
          Brand: string | null;
          "Car Condition": string | null;
          "Car ID": string | null;
          "Car Number": string | null;
          "Car Rating": number | null;
          "Card Condition": string | null;
          "Card Rating": number | null;
          "Case Number": string | null;
          "Catalog ID": string | null;
          Chase: boolean | null;
          Colour: string | null;
          Condition: string | null;
          Currency: string | null;
          Date: string | null;
          "Delivery Partner": string | null;
          "Expected Date": string | null;
          Favourite: boolean | null;
          "Image URL": string | null;
          Kuttu: boolean | null;
          Make: string | null;
          Model: string | null;
          Month: string | null;
          MRP: number | null;
          Name: string | null;
          O_Date: string | null;
          O_Month: string | null;
          Official: boolean | null;
          "Order ID": string | null;
          "Order Info": string | null;
          Paid: string | null;
          Payment: string | null;
          Rarity: string | null;
          Rate: string | null;
          Seller: string | null;
          Series: string | null;
          "Shipping Cost": string | null;
          "Shipping ID": string | null;
          Size: string | null;
          SNO: number | null;
          Spent: string | null;
          Status: string | null;
          "Sub Series": string | null;
          "Tracking ID": string | null;
          "Transit Info / ETA": string | null;
          Type: string | null;
          user_id: string | null;
          Variant: string | null;
          Year: number | null;
        };
        Insert: {
          Assortment?: string | null;
          Balance?: string | null;
          "Box ID"?: string | null;
          Brand?: string | null;
          "Car Condition"?: string | null;
          "Car ID"?: string | null;
          "Car Number"?: string | null;
          "Car Rating"?: number | null;
          "Card Condition"?: string | null;
          "Card Rating"?: number | null;
          "Case Number"?: string | null;
          "Catalog ID"?: string | null;
          Chase?: boolean | null;
          Colour?: string | null;
          Condition?: string | null;
          Currency?: string | null;
          Date?: string | null;
          "Delivery Partner"?: string | null;
          "Expected Date"?: string | null;
          Favourite?: boolean | null;
          "Image URL"?: string | null;
          Kuttu?: boolean | null;
          Make?: string | null;
          Model?: string | null;
          Month?: string | null;
          MRP?: number | null;
          Name?: string | null;
          O_Date?: string | null;
          O_Month?: string | null;
          Official?: boolean | null;
          "Order ID"?: string | null;
          "Order Info"?: string | null;
          Paid?: string | null;
          Payment?: string | null;
          Rarity?: string | null;
          Rate?: string | null;
          Seller?: string | null;
          Series?: string | null;
          "Shipping Cost"?: string | null;
          "Shipping ID"?: string | null;
          Size?: string | null;
          SNO?: number | null;
          Spent?: string | null;
          Status?: string | null;
          "Sub Series"?: string | null;
          "Tracking ID"?: string | null;
          "Transit Info / ETA"?: string | null;
          Type?: string | null;
          user_id?: string | null;
          Variant?: string | null;
          Year?: number | null;
        };
        Update: {
          Assortment?: string | null;
          Balance?: string | null;
          "Box ID"?: string | null;
          Brand?: string | null;
          "Car Condition"?: string | null;
          "Car ID"?: string | null;
          "Car Number"?: string | null;
          "Car Rating"?: number | null;
          "Card Condition"?: string | null;
          "Card Rating"?: number | null;
          "Case Number"?: string | null;
          "Catalog ID"?: string | null;
          Chase?: boolean | null;
          Colour?: string | null;
          Condition?: string | null;
          Currency?: string | null;
          Date?: string | null;
          "Delivery Partner"?: string | null;
          "Expected Date"?: string | null;
          Favourite?: boolean | null;
          "Image URL"?: string | null;
          Kuttu?: boolean | null;
          Make?: string | null;
          Model?: string | null;
          Month?: string | null;
          MRP?: number | null;
          Name?: string | null;
          O_Date?: string | null;
          O_Month?: string | null;
          Official?: boolean | null;
          "Order ID"?: string | null;
          "Order Info"?: string | null;
          Paid?: string | null;
          Payment?: string | null;
          Rarity?: string | null;
          Rate?: string | null;
          Seller?: string | null;
          Series?: string | null;
          "Shipping Cost"?: string | null;
          "Shipping ID"?: string | null;
          Size?: string | null;
          SNO?: number | null;
          Spent?: string | null;
          Status?: string | null;
          "Sub Series"?: string | null;
          "Tracking ID"?: string | null;
          "Transit Info / ETA"?: string | null;
          Type?: string | null;
          user_id?: string | null;
          Variant?: string | null;
          Year?: number | null;
        };
        Relationships: [];
      };
      tesoro_setu_backup_20260927_raw_all: {
        Row: {
          Assortment: string | null;
          Balance: string | null;
          "Box ID": string | null;
          Brand: string | null;
          "Car Condition": string | null;
          "Car ID": string | null;
          "Car Number": string | null;
          "Car Rating": number | null;
          "Card Condition": string | null;
          "Card Rating": number | null;
          "Case Number": string | null;
          "Catalog ID": string | null;
          Chase: boolean | null;
          Colour: string | null;
          Condition: string | null;
          Currency: string | null;
          Date: string | null;
          "Delivery Partner": string | null;
          "Expected Date": string | null;
          Favourite: boolean | null;
          "Image URL": string | null;
          Kuttu: boolean | null;
          Make: string | null;
          Model: string | null;
          Month: string | null;
          MRP: number | null;
          Name: string | null;
          O_Date: string | null;
          O_Month: string | null;
          Official: boolean | null;
          "Order ID": string | null;
          "Order Info": string | null;
          Paid: string | null;
          Payment: string | null;
          Rarity: string | null;
          Rate: string | null;
          Seller: string | null;
          Series: string | null;
          "Shipping Cost": string | null;
          "Shipping ID": string | null;
          Size: string | null;
          SNO: number | null;
          Spent: string | null;
          Status: string | null;
          "Sub Series": string | null;
          "Tracking ID": string | null;
          "Transit Info / ETA": string | null;
          Type: string | null;
          user_id: string | null;
          Variant: string | null;
          Year: number | null;
        };
        Insert: {
          Assortment?: string | null;
          Balance?: string | null;
          "Box ID"?: string | null;
          Brand?: string | null;
          "Car Condition"?: string | null;
          "Car ID"?: string | null;
          "Car Number"?: string | null;
          "Car Rating"?: number | null;
          "Card Condition"?: string | null;
          "Card Rating"?: number | null;
          "Case Number"?: string | null;
          "Catalog ID"?: string | null;
          Chase?: boolean | null;
          Colour?: string | null;
          Condition?: string | null;
          Currency?: string | null;
          Date?: string | null;
          "Delivery Partner"?: string | null;
          "Expected Date"?: string | null;
          Favourite?: boolean | null;
          "Image URL"?: string | null;
          Kuttu?: boolean | null;
          Make?: string | null;
          Model?: string | null;
          Month?: string | null;
          MRP?: number | null;
          Name?: string | null;
          O_Date?: string | null;
          O_Month?: string | null;
          Official?: boolean | null;
          "Order ID"?: string | null;
          "Order Info"?: string | null;
          Paid?: string | null;
          Payment?: string | null;
          Rarity?: string | null;
          Rate?: string | null;
          Seller?: string | null;
          Series?: string | null;
          "Shipping Cost"?: string | null;
          "Shipping ID"?: string | null;
          Size?: string | null;
          SNO?: number | null;
          Spent?: string | null;
          Status?: string | null;
          "Sub Series"?: string | null;
          "Tracking ID"?: string | null;
          "Transit Info / ETA"?: string | null;
          Type?: string | null;
          user_id?: string | null;
          Variant?: string | null;
          Year?: number | null;
        };
        Update: {
          Assortment?: string | null;
          Balance?: string | null;
          "Box ID"?: string | null;
          Brand?: string | null;
          "Car Condition"?: string | null;
          "Car ID"?: string | null;
          "Car Number"?: string | null;
          "Car Rating"?: number | null;
          "Card Condition"?: string | null;
          "Card Rating"?: number | null;
          "Case Number"?: string | null;
          "Catalog ID"?: string | null;
          Chase?: boolean | null;
          Colour?: string | null;
          Condition?: string | null;
          Currency?: string | null;
          Date?: string | null;
          "Delivery Partner"?: string | null;
          "Expected Date"?: string | null;
          Favourite?: boolean | null;
          "Image URL"?: string | null;
          Kuttu?: boolean | null;
          Make?: string | null;
          Model?: string | null;
          Month?: string | null;
          MRP?: number | null;
          Name?: string | null;
          O_Date?: string | null;
          O_Month?: string | null;
          Official?: boolean | null;
          "Order ID"?: string | null;
          "Order Info"?: string | null;
          Paid?: string | null;
          Payment?: string | null;
          Rarity?: string | null;
          Rate?: string | null;
          Seller?: string | null;
          Series?: string | null;
          "Shipping Cost"?: string | null;
          "Shipping ID"?: string | null;
          Size?: string | null;
          SNO?: number | null;
          Spent?: string | null;
          Status?: string | null;
          "Sub Series"?: string | null;
          "Tracking ID"?: string | null;
          "Transit Info / ETA"?: string | null;
          Type?: string | null;
          user_id?: string | null;
          Variant?: string | null;
          Year?: number | null;
        };
        Relationships: [];
      };
      tesoro_users: {
        Row: {
          approval_push_at: string | null;
          auth_uid: string | null;
          avatar_url: string | null;
          created_at: string;
          deleted_at: string | null;
          dob: string | null;
          email_id: string;
          first_name: string;
          gender: string | null;
          id_prefix: string | null;
          is_admin: boolean;
          is_approved: boolean;
          is_owner: boolean | null;
          last_name: string;
          phone: string | null;
          rejected_at: string | null;
          sno: number;
          user_id: string | null;
        };
        Insert: {
          approval_push_at?: string | null;
          auth_uid?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          dob?: string | null;
          email_id: string;
          first_name: string;
          gender?: string | null;
          id_prefix?: string | null;
          is_admin: boolean;
          is_approved?: boolean;
          is_owner?: boolean | null;
          last_name: string;
          phone?: string | null;
          rejected_at?: string | null;
          sno?: number;
          user_id?: string | null;
        };
        Update: {
          approval_push_at?: string | null;
          auth_uid?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          dob?: string | null;
          email_id?: string;
          first_name?: string;
          gender?: string | null;
          id_prefix?: string | null;
          is_admin?: boolean;
          is_approved?: boolean;
          is_owner?: boolean | null;
          last_name?: string;
          phone?: string | null;
          rejected_at?: string | null;
          sno?: number;
          user_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_list_users: {
        Args: never;
        Returns: {
          auth_uid: string;
          car_count: number;
          created_at: string;
          dob: string;
          email_id: string;
          first_name: string;
          is_admin: boolean;
          is_approved: boolean;
          is_owner: boolean;
          last_name: string;
          last_sign_in: string;
          rejected_at: string;
          sno: number;
          user_id: string;
        }[];
      };
      admin_update_user_email: {
        Args: { _email: string; _sno: number };
        Returns: undefined;
      };
      catalog_car_owners: {
        Args: { _car_id: string };
        Returns: {
          auth_uid: string;
          date_added: string;
          first_name: string;
          last_name: string;
          user_id: string;
        }[];
      };
      catalog_entry_usage: { Args: { _car_id: string }; Returns: number };
      catalog_merge_preview: { Args: { _drop_ids: string[] }; Returns: Json };
      catalog_push_to_collections: {
        Args: { _car_id?: string };
        Returns: number;
      };
      delete_catalog_entry: { Args: { _car_id: string }; Returns: Json };
      delete_push_subscription: {
        Args: { _endpoint: string };
        Returns: undefined;
      };
      email_for_login: { Args: { _identifier: string }; Returns: string };
      fn_generate_catalog_car_id: {
        Args: {
          p_assortment: string;
          p_brand: string;
          p_car_number: string;
          p_make: string;
          p_model: string;
          p_mrp: number;
          p_series: string;
          p_sub_series: string;
        };
        Returns: string;
      };
      is_tesoro_admin: { Args: { _uid: string }; Returns: boolean };
      is_tesoro_approved: { Args: { _uid: string }; Returns: boolean };
      is_tesoro_owner: { Args: { _uid: string }; Returns: boolean };
      is_valid_tesoro_handle: { Args: { _handle: string }; Returns: boolean };
      merge_catalog_entries: {
        Args: { _drop_ids: string[]; _keep_id: string };
        Returns: Json;
      };
      normalize_tesoro_handle: { Args: { _handle: string }; Returns: string };
      promote_staged_cars: { Args: { _older_than?: string }; Returns: number };
      recent_preorders: {
        Args: { days?: number; lim?: number };
        Returns: {
          assortment: string;
          brand: string;
          car_number: string;
          colour: string;
          copies: number;
          image_url: string;
          in_my_collection: boolean;
          last_ordered: string;
          make: string;
          model: string;
          mrp: number;
          rarity: string;
          series: string;
          size: string;
          sub_series: string;
          type: string;
          variant: string;
          year: string;
        }[];
      };
      save_push_subscription: {
        Args: {
          _auth: string;
          _endpoint: string;
          _p256dh: string;
          _user_agent?: string;
        };
        Returns: undefined;
      };
      search_catalogue: {
        Args: { lim?: number; q: string };
        Returns: {
          assortment: string;
          brand: string;
          car_number: string;
          colour: string;
          copies: number;
          image_url: string;
          make: string;
          model: string;
          mrp: number;
          rarity: string;
          series: string;
          size: string;
          sub_series: string;
          type: string;
          variant: string;
          year: string;
        }[];
      };
      tesoro_assign_id_prefix: {
        Args: { p_first: string; p_last: string; p_uid: string };
        Returns: string;
      };
      tesoro_assortment_usage: {
        Args: never;
        Returns: {
          cars: number;
          entries: number;
          name: string;
        }[];
      };
      tesoro_b32: { Args: { n: number; width: number }; Returns: string };
      tesoro_b32_decode: { Args: { t: string }; Returns: number };
      tesoro_casting_public_stats: {
        Args: { _car_id: string };
        Returns: {
          copies: number;
          last_seen: string;
          owners: number;
          paid_max: number;
          paid_min: number;
          prices: number;
        }[];
      };
      tesoro_catalog_code: {
        Args: { p_kind: string; p_parent: string; p_value: string };
        Returns: number;
      };
      tesoro_catalog_file: {
        Args: { r: Database["public"]["Tables"]["tesoro_raw"]["Row"] };
        Returns: string;
      };
      tesoro_catalog_first_owned_day: {
        Args: { _car_id: string };
        Returns: string;
      };
      tesoro_catalog_match: {
        Args: { r: Database["public"]["Tables"]["tesoro_raw"]["Row"] };
        Returns: string;
      };
      tesoro_catalog_new_id: {
        Args: {
          p_assortment: string;
          p_brand: string;
          p_make: string;
          p_model: string;
          p_series: string;
          p_sub_series: string;
        };
        Returns: string;
      };
      tesoro_delete_my_data: { Args: never; Returns: Json };
      tesoro_handle_available: { Args: { _handle: string }; Returns: boolean };
      tesoro_mark_car_seen: { Args: { _car_id: string }; Returns: undefined };
      tesoro_norm_status: { Args: { _status: string }; Returns: string };
      tesoro_parse_day: { Args: { _value: string }; Returns: string };
      tesoro_raw_code: {
        Args: { p_kind: string; p_value: string };
        Returns: string;
      };
      tesoro_raw_new_car_id: {
        Args: { p_assortment: string; p_brand: string; p_user: string };
        Returns: string;
      };
      tesoro_rename_assortment: {
        Args: { _from: string; _to: string };
        Returns: number;
      };
      tesoro_rename_field: {
        Args: { _field: string; _from: string; _to: string };
        Returns: number;
      };
      unique_tesoro_handle: {
        Args: { _desired: string; _exclude_sno?: number };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
