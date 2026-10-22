'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, CarFront, CircleX, ImagePlus, Sailboat, Truck, Bike, Wrench } from 'lucide-react';

export type PhotoCategory = 'space' | 'car' | 'rv' | 'motorcycle' | 'offroad' | 'boat';
export type DemoSitePhoto = {
  id: number;
  siteId: string;
  category: PhotoCategory;
  name: string;
  url: string;
};
export type DemoVehicle = {
  id: number;
  siteId: string;
  category: Exclude<PhotoCategory, 'space'>;
  description: string;
  identification: string;
};

export const photoCategories: {value: PhotoCategory; label: string}[] = [
  {value: 'space', label: 'Space / apartment'},
  {value: 'car', label: 'Car or truck'},
  {value: 'rv', label: 'RV / motorhome / trailer'},
  {value: 'motorcycle', label: 'Motorcycle'},
  {value: 'offroad', label: 'Off-road / ATV / UTV'},
  {value: 'boat', label: 'Boat / watercraft'},
];

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_PHOTOS = 12;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateDemoPhotos(currentCount: number, files: File[]): string | null {
  if (currentCount + files.length > MAX_PHOTOS)
    return 'Up to 12 photos are allowed per sample space. Remove an image to add another.';
  if (files.length === 0) return 'Please choose an image.';
  if (files.some((file) => !ACCEPTED.has(file.type) || file.size < 1 || file.size > MAX_FILE_SIZE))
    return 'Choose JPG, PNG or WebP pictures under 8 MB each. Other formats are not supported.';
  return null;
}

export function GuestSiteMedia({
  siteId, photos, vehicles, onAddPhotos, onRemovePhoto, onAddVehicle, onRemoveVehicle,
}: {
  siteId: string;
  photos: DemoSitePhoto[];
  vehicles: DemoVehicle[];
  onAddPhotos: (category: PhotoCategory, files: File[]) => string;
  onRemovePhoto: (photoId: number) => void;
  onAddVehicle: (vehicle: Pick<DemoVehicle, 'category' | 'description' | 'identification'>) => string;
  onRemoveVehicle: (vehicleId: number) => void;
}) {
  const [category, setCategory] = useState<PhotoCategory>('space');
  const [vehicleCategory, setVehicleCategory] = useState<DemoVehicle['category']>('car');
  const [description, setDescription] = useState('');
  const [identification, setIdentification] = useState('');
  const [message, setMessage] = useState('');
  const categoryName = (value: PhotoCategory) => photoCategories.find((x) => x.value === value)?.label ?? value;

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setMessage(onAddPhotos(category, files));
  }

  function addVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = onAddVehicle({ category: vehicleCategory, description: description.trim(), identification: identification.trim() });
    setMessage(result);
    if (result.startsWith('Added')) {
      setDescription('');
      setIdentification('');
    }
  }

  return <section className="demo-panel demo-record-editor demo-media-panel" aria-label={'Photos and vehicles for ' + siteId}>
    <div className="demo-section-head">
      <div><h2><Camera size={19}/> Photos &amp; vehicles — {siteId}</h2>
        <p>Keep examples of the actual space and what is parked there. This guest preview holds images only in this browser tab.</p>
      </div>
      <span className="demo-record-count">{photos.length} / 12 photos</span>
    </div>
    <div className="demo-media-chooser">
      <label htmlFor="demo-photo-category">What are these photos of?
        <select id="demo-photo-category" value={category} onChange={(event) => setCategory(event.target.value as PhotoCategory)}>
          {photoCategories.map((x) => <option value={x.value} key={x.value}>{x.label}</option>)}
        </select>
      </label>
      <label className="demo-photo-upload" htmlFor="demo-space-photos">
        <ImagePlus size={18}/> Add pictures
      </label>
      <input id="demo-space-photos" className="sr-only" aria-label="Upload photos for this space" type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple onChange={upload}/>
    </div>
    <p className="demo-caption">JPG, PNG or WebP; 8 MB maximum per picture, 12 photos per example space. No upload to Supabase or Vercel. Use sample pictures only.</p>
    {message && <p role="status" className="demo-notice">{message}</p>}
    {photos.length === 0 ? <div className="demo-media-empty"><Camera size={25}/><p>No sample pictures for this space yet. Choose a category and add photos to see the gallery.</p></div> :
      <div className="demo-photo-grid">
        {photos.map((photo) => <figure key={photo.id} className="demo-photo-card">
          {/* Browser-only object URL, never sent to Next image optimization or a server. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={categoryName(photo.category) + ' example for ' + siteId}/>
          <figcaption><strong>{categoryName(photo.category)}</strong><small title={photo.name}>{photo.name}</small></figcaption>
          <button type="button" aria-label={'Remove photo ' + photo.name} title="Remove picture" onClick={() => {onRemovePhoto(photo.id); setMessage('Photo removed from this sample space.');}}>
            <CircleX size={17}/>
          </button>
        </figure>)}
      </div>
    }
    <div className="demo-media-vehicles">
      <h3><CarFront size={18}/> Vehicles &amp; watercraft on this space</h3>
      <p className="demo-caption">Sample inventory for cars, RVs, motorcycles, off-road vehicles and boats. Do not enter real plate numbers in a public demo.</p>
      <form className="demo-vehicle-form" onSubmit={addVehicle}>
        <label htmlFor="demo-vehicle-type">Vehicle type
          <select id="demo-vehicle-type" value={vehicleCategory} onChange={(event) => setVehicleCategory(event.target.value as DemoVehicle['category'])}>
            {photoCategories.filter((x) => x.value !== 'space').map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </label>
        <label htmlFor="demo-vehicle-description">Description / make / model
          <input id="demo-vehicle-description" required maxLength={100} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Example: Blue pickup"/>
        </label>
        <label htmlFor="demo-vehicle-id">Sample identifier (optional)
          <input id="demo-vehicle-id" maxLength={40} value={identification} onChange={(event) => setIdentification(event.target.value)} placeholder="Example: Trailer A"/>
        </label>
        <button type="submit" className="demo-action">Add vehicle</button>
      </form>
      {vehicles.length ? <div className="demo-vehicle-list">
        {vehicles.map((vehicle) => <article key={vehicle.id}>
          <span className="demo-vehicle-icon">{vehicle.category === 'boat' ? <Sailboat size={20}/> : vehicle.category === 'motorcycle' ? <Bike size={20}/> : vehicle.category === 'offroad' ? <Wrench size={20}/> : vehicle.category === 'rv' ? <Truck size={20}/> : <CarFront size={20}/>}</span>
          <div><strong>{vehicle.description}</strong><small>{categoryName(vehicle.category)}{vehicle.identification ? ' · ' + vehicle.identification : ''}</small></div>
          <button type="button" aria-label={'Remove vehicle ' + vehicle.description} onClick={() => {onRemoveVehicle(vehicle.id); setMessage('Vehicle removed from this sample space.');}}>Remove</button>
        </article>)}
      </div> : <p className="demo-media-empty">No sample vehicles registered to this space yet.</p>}
    </div>
  </section>;
}
