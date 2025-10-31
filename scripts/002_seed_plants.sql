-- Insert some default plant models
INSERT INTO plant_models (name, growth_time, harvest_value, seed_cost, image_url) VALUES
  ('Wheat', 60, 15.00, 5.00, '/plants/wheat.png'),
  ('Corn', 120, 35.00, 12.00, '/plants/corn.png'),
  ('Tomato', 180, 60.00, 20.00, '/plants/tomato.png'),
  ('Carrot', 90, 25.00, 8.00, '/plants/carrot.png'),
  ('Potato', 150, 50.00, 15.00, '/plants/potato.png')
ON CONFLICT DO NOTHING;
